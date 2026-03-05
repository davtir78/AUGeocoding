import os
import json
import logging
import re
import boto3
import psycopg2
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth

# Configure Logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment Variables
DB_SECRET_ARN = os.environ.get('DB_SECRET_ARN')
DB_HOST = os.environ.get('DB_HOST')
DB_NAME = os.environ.get('DB_NAME', 'geocoder')
REGION = os.environ.get('AWS_REGION', 'ap-southeast-2')
OPENSEARCH_ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT')

# ─── Clients (initialised once per container) ───────────────────
secrets_client = boto3.client('secretsmanager', region_name=REGION)
_db_conn = None
_os_client = None


# ─── Helpers ─────────────────────────────────────────────────────
def get_db_connection():
    """Return a reusable psycopg2 connection (for MMM enrichment)."""
    global _db_conn
    if _db_conn and not _db_conn.closed:
        return _db_conn
    secret = json.loads(
        secrets_client.get_secret_value(SecretId=DB_SECRET_ARN)['SecretString']
    )
    _db_conn = psycopg2.connect(
        host=DB_HOST,
        port=secret.get('port', 5432),
        user=secret['username'],
        password=secret['password'],
        dbname=DB_NAME,
    )
    logger.info("DB connection established.")
    return _db_conn


def get_os_client():
    """Return a reusable OpenSearch client."""
    global _os_client
    if _os_client is not None:
        return _os_client
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, REGION, 'es')
    _os_client = OpenSearch(
        hosts=[{'host': OPENSEARCH_ENDPOINT, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=25,
    )
    logger.info("OpenSearch client created.")
    return _os_client


# ─── Lightweight Address Tokenizer (replaces libpostal) ─────────
# Regex patterns for common AU address components
_RE_FLAT = re.compile(
    r'^(?:unit|u|apt|flat|suite|ste|lot)\s*(\d+\w?)',
    re.IGNORECASE,
)
_RE_LEVEL = re.compile(r'^(?:level|lvl|l)\s*(\d+)', re.IGNORECASE)
_STREET_TYPES = {
    'st', 'street', 'rd', 'road', 'ave', 'avenue', 'dr', 'drive',
    'pl', 'place', 'ct', 'court', 'cr', 'cres', 'crescent', 'cir',
    'circuit', 'tce', 'terrace', 'pde', 'parade', 'hwy', 'highway',
    'bvd', 'boulevard', 'ln', 'lane', 'cl', 'close', 'way', 'wk', 'walk',
}
_STATES = {'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'}


def tokenize_address(raw: str) -> dict:
    """
    Simple rule-based tokenizer that extracts structured components
    from an Australian address string.
    Returns dict with keys: flat, level, number, street, type, locality,
    state, postcode, query (cleaned full string for OpenSearch).
    """
    tokens = {
        'flat': None, 'level': None, 'number': None,
        'street': None, 'type': None, 'locality': None,
        'state': None, 'postcode': None,
    }

    # Normalise
    text = raw.strip()
    # Handle "3/42 Smith St" → flat=3, rest="42 Smith St"
    slash_match = re.match(r'^(\d+\w?)\s*/\s*(.+)', text)
    if slash_match:
        tokens['flat'] = slash_match.group(1)
        text = slash_match.group(2)

    # Handle "Unit 3, 42 Smith St"
    flat_match = _RE_FLAT.match(text)
    if flat_match:
        tokens['flat'] = flat_match.group(1)
        text = text[flat_match.end():].lstrip(' ,/-')

    # Handle "Level 3, 42 Smith St"
    level_match = _RE_LEVEL.match(text)
    if level_match:
        tokens['level'] = level_match.group(1)
        text = text[level_match.end():].lstrip(' ,/-')

    # Split remaining into parts
    parts = [p.strip(',.') for p in text.split() if p.strip(',.')]

    # Extract postcode (4-digit number)
    if parts and re.match(r'^\d{4}$', parts[-1]):
        tokens['postcode'] = parts.pop()

    # Extract state
    if parts and parts[-1].lower() in _STATES:
        tokens['state'] = parts.pop().upper()

    # Extract street number (first numeric-ish token)
    if parts and re.match(r'^\d+\w?$', parts[0]):
        tokens['number'] = parts.pop(0)
        # Handle number range "42-44"
        if parts and re.match(r'^-?\d+\w?$', parts[0]):
            parts.pop(0)  # skip the range end

    # Extract street type (scan from end)
    for i in range(len(parts) - 1, -1, -1):
        if parts[i].lower() in _STREET_TYPES:
            tokens['type'] = parts.pop(i).upper()
            break

    # Remaining parts: street name tokens, then locality
    # Heuristic: if there are 2+ tokens left, last one(s) are locality
    if len(parts) >= 3:
        # Try to find where street name ends and locality begins
        # Simple heuristic: last token(s) after the street are locality
        tokens['street'] = ' '.join(parts[:-1])
        tokens['locality'] = parts[-1]
    elif len(parts) == 2:
        tokens['street'] = parts[0]
        tokens['locality'] = parts[1]
    elif len(parts) == 1:
        tokens['street'] = parts[0]

    # Build clean query for full-text search
    tokens['query'] = raw.strip()

    return tokens


# ─── OpenSearch Query Builder ────────────────────────────────────
def build_os_query(tokens: dict, raw_query: str) -> dict:
    """
    Build an OpenSearch bool query that combines:
    - Full-text fuzzy match on address_string (recall)
    - Structured field boosts (precision)
    """
    must_clauses = []
    should_clauses = []
    filter_clauses = []

    # Primary: full-text match on address_string with fuzziness (scoring signal)
    should_clauses.append({
        "match": {
            "address_string": {
                "query": raw_query,
                "fuzziness": "AUTO",
                "operator": "or",
                "minimum_should_match": "40%"
            }
        }
    })

    # Also search primary_address_string for building-level queries
    should_clauses.append({
        "match": {
            "primary_address_string": {
                "query": raw_query,
                "fuzziness": "AUTO",
                "operator": "or",
                "minimum_should_match": "40%",
                "boost": 0.5
            }
        }
    })

    # Hard Constraints: If we have a number and street, they SHOULD be present.
    # We move them to must_clauses but with some flexibility (fuzzy).
    if tokens.get('number'):
        must_clauses.append({
            "term": {"number_first": {"value": tokens['number']}}
        })
    
    if tokens.get('street'):
        must_clauses.append({
            "match": {
                "street_name": {
                    "query": tokens['street'],
                    "fuzziness": "AUTO"
                }
            }
        })

    # High priority location boosts
    if tokens.get('locality'):
        should_clauses.append({
            "match": {
                "locality": {
                    "query": tokens['locality'],
                    "fuzziness": "AUTO",
                    "boost": 100
                }
            }
        })

    if tokens.get('postcode') and tokens.get('state'):
        # Both present: use as filters (mandatory, eliminates wrong-state candidates)
        filter_clauses.append({"term": {"postcode": tokens['postcode']}})
        filter_clauses.append({"term": {"state": tokens['state'].upper()}})
    else:
        # Only one present: boost heavily but don't hard-filter
        if tokens.get('postcode'):
            should_clauses.append({
                "term": {"postcode": {"value": tokens['postcode'], "boost": 200}}
            })
        if tokens.get('state'):
            should_clauses.append({
                "term": {"state": {"value": tokens['state'].upper(), "boost": 150}}
            })

    if tokens.get('type'):
        should_clauses.append({
            "term": {"street_type": {"value": tokens['type'].upper(), "boost": 10}}
        })

    # Principal Address Logic
    is_unit_query = bool(tokens.get('flat') or tokens.get('level'))
    
    if not is_unit_query:
        should_clauses.append({
            "term": {"primary_secondary": {"value": "P", "boost": 400.0}}
        })
        should_clauses.append({
            "term": {"is_base_address": {"value": True, "boost": 300.0}}
        })
    else:
        should_clauses.append({
            "term": {"is_base_address": {"value": False, "boost": 100.0}}
        })
        if tokens.get('flat'):
            should_clauses.append({"term": {"flat_number": {"value": tokens['flat'], "boost": 50}}})
        if tokens.get('level'):
            should_clauses.append({"term": {"level_number": {"value": tokens['level'], "boost": 50}}})

    # Exact Street Name Boost
    if tokens.get('street'):
        should_clauses.append({
            "term": {"street_name.keyword": {"value": tokens['street'].upper(), "boost": 1500.0}}
        })

    query = {
        "size": 10,
        "query": {
            "bool": {
                "must": must_clauses,
                "should": should_clauses,
                "filter": filter_clauses,
                "minimum_should_match": 1
            }
        }
    }
    logger.info(f"OpenSearch Query: {json.dumps(query)}")
    return query



# ─── Spatial Enrichment (MMM + LGA + Mesh Block) ────────────────
def enrich_spatial(lon: float, lat: float) -> dict:
    """Perform PostGIS point-in-polygon lookups for MMM, LGA, and Mesh Block."""
    enrichment = {"mmm_regions": [], "lga": [], "mesh_block": []}
    try:
        conn = get_db_connection()
        point_sql = "ST_SetSRID(ST_Point(%s, %s), 4326)"
        with conn.cursor() as cur:
            # MMM
            cur.execute(f"""
                SELECT year, mmm_code
                FROM mmm
                WHERE ST_Contains(geom, {point_sql})
                ORDER BY year DESC;
            """, (lon, lat))
            enrichment['mmm_regions'] = [
                {"year": r[0], "mmm_code": r[1]} for r in cur.fetchall()
            ]

            # LGA
            cur.execute(f"""
                SELECT lga_code, lga_name, state_name
                FROM lga
                WHERE ST_Contains(geom, {point_sql})
                LIMIT 1;
            """, (lon, lat))
            enrichment['lga'] = [
                {"lga_code": r[0], "lga_name": r[1], "state": r[2]}
                for r in cur.fetchall()
            ]

            # Mesh Block
            cur.execute(f"""
                SELECT mb_code, mb_category, sa2_name
                FROM mesh_block
                WHERE ST_Contains(geom, {point_sql})
                LIMIT 1;
            """, (lon, lat))
            enrichment['mesh_block'] = [
                {"mb_code": r[0], "category": r[1], "sa2_name": r[2]}
                for r in cur.fetchall()
            ]

    except Exception as e:
        logger.error(f"Spatial enrichment failed for ({lon},{lat}): {e}")
    return enrichment


# ─── Format Result ───────────────────────────────────────────────
def format_result(hit: dict, max_score: float) -> dict:
    """Convert an OpenSearch hit into a standardised API response."""
    src = hit['_source']
    score = hit['_score']

    # Normalise score to 0-100
    confidence = round((score / max_score) * 100, 1) if max_score > 0 else 0

    loc = src.get('location', {})
    lat = loc.get('lat')
    lon = loc.get('lon')

    # Trigram score and Token score proxies for UI
    # In a real system these would be specific similarity metrics
    # Here we split the score for visualization purposes
    trigram_score = min(0.95, score / max_score) if max_score > 0 else 0
    token_score = 1.0 if confidence > 80 else (confidence / 100.0)

    result = {
        "gnaf_pid": src.get('gnaf_pid'),
        "primary_pid": src.get('primary_pid'),
        "primary_secondary": src.get('primary_secondary'),
        "primary_address_string": src.get('primary_address_string'),
        "address": src.get('address_string'),
        "confidence": confidence,
        "raw_score": score,
        "is_base": src.get('is_base_address'),
        "trigram_score": trigram_score,
        "token_score": token_score,
        "coordinates": {"latitude": lat, "longitude": lon},
        "tokens": {
            "building": src.get('building_name'),
            "flat": src.get('flat_number'),
            "level": src.get('level_number'),
            "number": src.get('number_first'),
            "number_last": src.get('number_last'),
            "street_name": src.get('street_name'),
            "street_type": src.get('street_type'),
            "street_suffix": src.get('street_suffix'),
            "locality": src.get('locality'),
            "state": src.get('state'),
            "postcode": src.get('postcode'),
        },
    }

    # Spatial Enrichment (only for top results with coordinates)
    if lat and lon and confidence >= 50:
        spatial = enrich_spatial(lon, lat)
        result['mmm_regions'] = spatial['mmm_regions']
        result['lga'] = spatial['lga']
        result['mesh_block'] = spatial['mesh_block']

    return result


# ─── Lambda Handler ──────────────────────────────────────────────
def handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    try:
        # ── Parse input ──────────────────────────────────────────
        body = {}
        if 'body' in event:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        elif 'address' in event:
            body = event

        address = body.get('address')
        gnaf_pid = body.get('gnaf_pid')

        # Initialize os_client early if needed for gnaf_pid lookup
        os_client = get_os_client()

        if gnaf_pid:
            res = os_client.get(index="gnaf", id=gnaf_pid, ignore=404)
            return {
                'statusCode': 200,
                'body': json.dumps({'results': [res.get('_source')] if res.get('found') else []}, default=str)
            }

        if not address:
            return _response(400, {"error": "Missing 'address' field"})

        # ── Tokenize (local, no libpostal) ───────────────────────
        tokens = tokenize_address(address)
        logger.info(f"Tokens: {tokens}")

        # ── Query OpenSearch ─────────────────────────────────────
        os_client = get_os_client()
        os_query = build_os_query(tokens, address)

        response = os_client.search(index="gnaf", body=os_query)
        hits = response['hits']['hits']
        max_score = response['hits'].get('max_score', 1) or 1

        results = [format_result(h, max_score) for h in hits]

        # ── Fix for "Building vs Unit" Regression (e.g. 1 Martin Pl) ──
        # If the user searched for a building but we matched a unit/secondary record,
        # we check if we can resolve the official primary parent.
        is_unit_query = bool(tokens.get('flat') or tokens.get('level'))
        if not is_unit_query and results:
            best = results[0]
            # If the best result is a secondary address (has a primary_pid)
            if best.get('primary_secondary') == 'S' and best.get('primary_pid'):
                # Check if the primary record itself is already in the results
                primary_already_present = any(r.get('gnaf_pid') == best['primary_pid'] for r in results)
                
                if not primary_already_present:
                    # Resolve from denormalized data or fallback to synthesis
                    parent_address = best.get('primary_address_string')
                    
                    if parent_address:
                        logger.info(f"Resolving primary address '{parent_address}' from denormalized hit for {best['gnaf_pid']}")
                        synth = best.copy()
                        synth['is_base'] = True
                        synth['address'] = parent_address
                        synth['gnaf_pid'] = best['primary_pid']
                        synth['primary_secondary'] = 'P'
                        # Clear unit tokens for the parent
                        synth['tokens'] = best['tokens'].copy()
                        synth['tokens']['flat'] = None
                        synth['tokens']['level'] = None
                        results.insert(0, synth)
                    else:
                        # Fallback to synthesis only if denormalization missed it
                        logger.warning(f"No primary_address_string for {best['gnaf_pid']}, falling back to synthesis")
                        synth = best.copy()
                        synth['is_base'] = True
                        synth['tokens'] = best['tokens'].copy()
                        synth['tokens']['flat'] = None
                        synth['tokens']['level'] = None
                        
                        # Reconstruct address string without the unit portion
                        t = synth['tokens']
                        address_parts = []
                        if t.get('number'):
                            num = t['number']
                            if t.get('number_last'):
                                num += "-" + t['number_last']
                            address_parts.append(num)
                        
                        for component in ['street_name', 'street_type', 'street_suffix', 'locality', 'state', 'postcode']:
                            if t.get(component):
                                address_parts.append(t[component])
                                
                        synth['address'] = " ".join(address_parts)
                        synth['gnaf_pid'] = best['primary_pid'] # Use the real primary PID!
                        results.insert(0, synth)

        return _response(200, {
            "input": address,
            "parsed_tokens": {k: v for k, v in tokens.items() if k != 'query'},
            "result_count": len(results),
            "results": results[:10], # Ensure we obey max 10
        })

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return _response(500, {"error": str(e)})


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=str),
    }
