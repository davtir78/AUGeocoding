import json

def build_os_query(tokens: dict, raw_query: str) -> dict:
    must_clauses = []
    should_clauses = []
    filter_clauses = []

    sub_must = []
    sub_must.append({
        "match": {
            "address_string": {
                "query": raw_query,
                "fuzziness": "AUTO",
                "operator": "or",
                "minimum_should_match": "40%"
            }
        }
    })

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

    if tokens.get('locality'):
        should_clauses.append({
            "match": {
                "locality": {
                    "query": tokens['locality'],
                    "fuzziness": "AUTO",
                    "boost": 20
                }
            }
        })

    if tokens.get('postcode'):
        should_clauses.append({
            "term": {"postcode": {"value": tokens['postcode'], "boost": 15}}
        })

    if tokens.get('state'):
        should_clauses.append({
            "term": {"state": {"value": tokens['state'].upper(), "boost": 10}}
        })

    if tokens.get('type'):
        should_clauses.append({
            "term": {"street_type": {"value": tokens['type'].upper(), "boost": 5}}
        })

    if tokens.get('flat'):
        must_clauses.append({
            "exists": {"field": "flat_number"}
        })
        should_clauses.append({
            "term": {"flat_number": {"value": tokens['flat'], "boost": 50}}
        })
    else:
        should_clauses.append({
            "bool": {
                "must_not": {
                    "exists": {"field": "flat_number"}
                },
                "boost": 100.0
            }
        })

    must_clauses.extend(sub_must)

    query = {
        "bool": {
            "must": must_clauses,
            "should": should_clauses,
            "filter": filter_clauses,
        }
    }

    return {
        "size": 10,
        "query": query,
        "_source": True,
    }

if __name__ == "__main__":
    test_tokens = {
        'flat': None,
        'number': '1',
        'street': 'martin',
        'query': '1 martin pl sydney',
        'locality': 'sydney'
    }
    try:
        q = build_os_query(test_tokens, test_tokens['query'])
        print(json.dumps(q, indent=2))
        print("\n[SUCCESS] Query built correctly.")
    except Exception as e:
        print(f"\n[ERROR] Failed to build query: {e}")
