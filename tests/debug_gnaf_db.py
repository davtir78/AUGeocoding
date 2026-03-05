import boto3
import json

lambda_client = boto3.client('lambda', region_name='ap-southeast-2')

def get_sql_results(sql):
    payload = {'mode': 'SQL', 'sql': sql}
    response = lambda_client.invoke(FunctionName='aws-geocoding-loader', Payload=json.dumps(payload))
    res_payload = json.loads(response['Payload'].read())
    if 'results' in res_payload:
        return res_payload['results']
    else:
        print(f"Error in response: {res_payload}")
        return []

if __name__ == "__main__":
    sql = """
    SELECT gnaf_pid, address_string, flat_number, level_number, building_name
    FROM gnaf 
    WHERE street_name = 'MARTIN' AND number_first = '1' AND locality = 'SYDNEY'
    ORDER BY address_string
    LIMIT 100;
    """
    results = get_sql_results(sql)
    print(f"{'PID':<15} | {'Flat':<5} | {'Level':<5} | {'Address String'}")
    print("-" * 80)
    for r in results:
        pid, addr, flat, level, building = r
        print(f"{pid:<15} | {str(flat):<5} | {str(level):<5} | {addr}")
