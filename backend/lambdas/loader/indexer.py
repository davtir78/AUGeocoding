import os
import boto3
from datetime import datetime, timezone
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth, helpers

from config import logger, OPENSEARCH_ENDPOINT, REGION
from db import get_conn
from utils import normalize_index_name

def handle_indexer(mode, event, creds):
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, REGION, 'es')
    
    os_client = OpenSearch(
        hosts=[{'host': OPENSEARCH_ENDPOINT, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=60
    )
    
    if mode == 'INDEX_OPENSEARCH':
        raw_name = event.get('index_name', os.environ.get('INDEX_NAME', 'gnaf'))
        index_name = normalize_index_name(raw_name)
        if not index_name:
            raise ValueError("Could not determine OpenSearch index name")
        logger.info(f"Targeting index: '{index_name}' (Raw: '{raw_name}')")
        
        if event.get('create_index'):
            index_body = {
                "settings": {
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                    "refresh_interval": "120s",
                    "analysis": {
                        "analyzer": {
                            "address_analyzer": {
                                "type": "custom",
                                "tokenizer": "standard",
                                "filter": ["lowercase", "asciifolding", "address_synonyms"]
                            }
                        },
                        "filter": {
                            "address_synonyms": {
                                "type": "synonym",
                                "synonyms": [
                                    "st => street", "rd => road", "ave, av => avenue", "dr => drive",
                                    "ct => court", "pl => place", "cr, cres => crescent", "bvd => boulevard",
                                    "hwy => highway", "pde => parade", "tce => terrace",
                                    "u, unt => unit", "ft, flt => flat", "apt => apartment", "lvl => level",
                                    "nsw => new south wales", "vic => victoria", "qld => queensland",
                                    "sa => south australia", "wa => western australia", "tas => tasmania",
                                    "act => australian capital territory", "nt => northern territory"
                                ]
                            }
                        }
                    }
                },
                "mappings": {
                    "properties": {
                        "gnaf_pid": {"type": "keyword"},
                        "primary_pid": {"type": "keyword"},
                        "primary_secondary": {"type": "keyword"},
                        "primary_address_string": {
                            "type": "text",
                            "analyzer": "address_analyzer"
                        },
                        "address_string": {
                            "type": "text",
                            "analyzer": "address_analyzer",
                            "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}
                        },
                        "number_first": {"type": "keyword"},
                        "street_name": {"type": "text", "analyzer": "address_analyzer"},
                        "street_type": {"type": "keyword"},
                        "street_suffix": {"type": "keyword"},
                        "locality": {
                            "type": "text",
                            "analyzer": "address_analyzer",
                            "fields": {"keyword": {"type": "keyword"}}
                        },
                        "state": {"type": "keyword"},
                        "postcode": {"type": "keyword"},
                        "flat_number": {"type": "keyword"},
                        "level_number": {"type": "keyword"},
                        "lot_number": {"type": "keyword"},
                        "is_base_address": {"type": "boolean"},
                        "is_synthetic": {"type": "boolean"},
                        "hierarchy_rank": {"type": "short"},
                        "lga_code": {"type": "keyword"},
                        "lga_name": {"type": "keyword"},
                        "mb_2016": {"type": "keyword"},
                        "mb_2021": {"type": "keyword"},
                        "mmm_2015": {"type": "integer"},
                        "mmm_2019": {"type": "integer"},
                        "mmm_2023": {"type": "integer"},
                        "location": {"type": "geo_point"}
                    }
                }
            }
            if os_client.indices.exists(index=index_name):
                logger.info(f"Deleting existing index {index_name}")
                os_client.indices.delete(index=index_name)
            
            logger.info(f"Creating index {index_name}")
            os_client.indices.create(index=index_name, body=index_body)
            return {"status": "INDEX_CREATED"}

        # Bulk Indexing (Keyset Pagination)
        limit = int(event.get('limit', 5000))
        last_id = event.get('last_id')
        iterate = event.get('iterate', False)
        
        def update_indexing_progress(execution_id, step_name, total_indexed, last_id):
            try:
                dynamodb = boto3.resource('dynamodb', region_name=REGION)
                progress_table = dynamodb.Table(os.environ.get('PROGRESS_TABLE', 'aws-geocoding-pipeline-progress'))
                progress_table.update_item(
                    Key={'ExecutionId': execution_id, 'StepName': step_name},
                    UpdateExpression="SET metadata.progress_percent = :p, metadata.records_processed = :rp, metadata.last_id = :li, last_updated = :lu",
                    ExpressionAttributeValues={
                        ':p': round(100 * total_indexed / 16841097, 2),
                        ':rp': total_indexed,
                        ':li': last_id,
                        ':lu': datetime.now(timezone.utc).isoformat()
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to update progress: {e}")

        total_indexed = 0
        conn = get_conn(creds)
        try:
            with conn.cursor() as cur:
                while True:
                    if last_id:
                        sql = f"""
                            SELECT gnaf_pid, primary_pid, primary_secondary, primary_address_string,
                                   address_string, number_first, street_name, street_type, street_suffix,
                                   locality, state, postcode, flat_number, level_number, lot_number,
                                   is_base_address, is_synthetic, hierarchy_rank, ST_X(geom) as longitude, ST_Y(geom) as latitude,
                                   lga_code, lga_name, mb_2016, mb_2021, mmm_2015, mmm_2019, mmm_2023
                            FROM gnaf_export_view 
                            WHERE gnaf_pid > %s
                            ORDER BY gnaf_pid ASC 
                            LIMIT %s
                        """
                        cur.execute(sql, (last_id, limit))
                    else:
                        sql = f"""
                            SELECT gnaf_pid, primary_pid, primary_secondary, primary_address_string,
                                   address_string, number_first, street_name, street_type, street_suffix,
                                   locality, state, postcode, flat_number, level_number, lot_number,
                                   is_base_address, is_synthetic, hierarchy_rank, ST_X(geom) as longitude, ST_Y(geom) as latitude,
                                   lga_code, lga_name, mb_2016, mb_2021, mmm_2015, mmm_2019, mmm_2023
                            FROM gnaf_export_view 
                            ORDER BY gnaf_pid ASC 
                            LIMIT %s
                        """
                        cur.execute(sql, (limit,))
                        
                    rows = cur.fetchall()
                    if not rows: 
                        logger.info(f"Indexing complete. Total indexed: {total_indexed}")
                        return {"status": "SUCCESS", "indexed": total_indexed, "last_id": last_id}
                    
                    actions = []
                    current_batch_last_id = rows[-1][0]
                    
                    for row in rows:
                        p_id, p_pid, p_sec, p_addr, addr, n_f, s_n, s_t, s_s, loc, st, pc, flat, lvl, lot, \
                            is_base, is_synth, rank, lon, lat, \
                            lga_c, lga_n, mb_16, mb_21, mmm_15, mmm_19, mmm_23 = row
                        
                        doc = {
                            "gnaf_pid": p_id, "primary_pid": p_pid, "primary_secondary": p_sec,
                            "primary_address_string": p_addr, "address_string": addr, "number_first": str(n_f) if n_f else None,
                            "street_name": s_n, "street_type": s_t, "street_suffix": s_s, "locality": loc, "state": st, "postcode": pc,
                            "flat_number": str(flat) if flat else None, "level_number": str(lvl) if lvl else None, "lot_number": str(lot) if lot else None,
                            "is_base_address": bool(is_base), "is_synthetic": bool(is_synth), "hierarchy_rank": int(rank) if rank is not None else 3,
                            "lga_code": lga_c, "lga_name": lga_n, "mb_2016": mb_16, "mb_2021": mb_21, 
                            "mmm_2015": mmm_15, "mmm_2019": mmm_19, "mmm_2023": mmm_23
                        }
                        if lon and lat: doc["location"] = {"lat": float(lat), "lon": float(lon)}
                        
                        action = {
                            "_op_type": "index",
                            "_index": index_name,
                            "_id": p_id,
                            **doc
                        }
                        actions.append(action)
                    
                    success, failed = helpers.bulk(
                        os_client,
                        actions,
                        chunk_size=2000,
                        max_retries=5,
                        initial_backoff=2,
                        max_backoff=60,
                        request_timeout=120
                    )
                    total_indexed += success
                    last_id = current_batch_last_id
                    logger.info(f"Indexed batch of {success}. Last ID: {last_id}. Total: {total_indexed}")
                    
                    if 'execution_id' in event and 'step_name' in event:
                        update_indexing_progress(event['execution_id'], event['step_name'], total_indexed, last_id)

                    if not iterate:
                        return {"status": "SUCCESS", "indexed": total_indexed, "last_id": last_id}
        finally:
            conn.close()

    elif mode == 'INDEX_SPECIFIC_PIDS':
        raw_name = event.get('index_name', 'gnaf')
        index_name = normalize_index_name(raw_name)
        pids = event.get('pids', [])
        if not pids: return {"status": "ERROR", "message": "No pids provided"}
        conn = get_conn(creds)
        try:
            with conn.cursor() as cur:
                pids_str = "('" + "','".join(pids) + "')"
                sql = f"SELECT gnaf_pid, primary_pid, primary_secondary, primary_address_string, address_string, number_first, number_last, flat_number, level_number, lot_number, building_name, street_name, street_type, street_suffix, locality, state, postcode, is_base_address, is_synthetic, ST_X(geom) as longitude, ST_Y(geom) as latitude FROM gnaf_export_view WHERE gnaf_pid IN {pids_str}"
                cur.execute(sql)
                rows = cur.fetchall()
                if not rows: return {"status": "SUCCESS", "indexed": 0}
                actions = []
                for row in rows:
                    g_id, p_pid, p_sec, p_addr, addr, nf, nl, flat, lvl, lot, bld, sn, st, ss, loc, state, pc, is_b, is_s, lon, lat = row
                    doc = { "gnaf_pid": g_id, "primary_pid": p_pid, "primary_secondary": p_sec, "primary_address_string": p_addr, "address_string": addr, "number_first": str(nf) if nf else None, "number_last": str(nl) if nl else None, "flat_number": str(flat) if flat else None, "level_number": str(lvl) if lvl else None, "building_name": bld, "street_name": sn, "street_type": st, "street_suffix": ss, "locality": loc, "state": state, "postcode": pc, "is_base_address": bool(is_b), "is_synthetic": bool(is_s) }
                    if lon and lat: doc["location"] = {"lat": float(lat), "lon": float(lon)}
                    
                    action = {
                        "_op_type": "index",
                        "_index": index_name,
                        "_id": g_id,
                        **doc
                    }
                    actions.append(action)
                    
                success, failed = helpers.bulk(
                    os_client,
                    actions,
                    chunk_size=500,
                    max_retries=5,
                    initial_backoff=2,
                    max_backoff=60,
                    request_timeout=120
                )
                return {"status": "SUCCESS", "indexed": success}
        finally:
            conn.close()

    elif mode == 'UPDATE_ALIAS':
        alias_name = normalize_index_name(event.get('alias_name', os.environ.get('INDEX_NAME', 'gnaf')))
        raw_name = event.get('index_name')
        index_name = normalize_index_name(raw_name)
        if not index_name: return {"status": "ERROR", "message": "No index_name provided to UPDATE_ALIAS"}
        
        alias_exists = False
        try:
            if os_client.indices.exists(index=alias_name):
                if not os_client.indices.exists_alias(name=alias_name):
                    logger.warning(f"Conflict: Physical index '{alias_name}' exists. Deleting it to make room for alias.")
                    os_client.indices.delete(index=alias_name)
                else:
                    logger.info(f"Confirmed '{alias_name}' exists as an alias.")
                    alias_exists = True
        except Exception as e:
            logger.warning(f"Error during alias conflict resolution for '{alias_name}': {e}")

        logger.info(f"Updating alias '{alias_name}' to point to '{index_name}'")
        actions = []
        if alias_exists:
            actions.append({"remove": {"index": "*", "alias": alias_name}})
        
        actions.append({"add": {"index": index_name, "alias": alias_name}})
        
        return {"status": "SUCCESS", "response": os_client.indices.update_aliases(body={"actions": actions})}

    elif mode == 'GET_INFO':
        return {"indices": os_client.indices.get_alias(index="*"), "health": os_client.cluster.health()}

    else:
        raise ValueError(f"Unknown indexer mode: {mode}")
