import boto3

def get_cols(cluster_arn, secret_arn, table_name):
    client = boto3.client('rds-data', region_name='ap-southeast-2')
    sql = f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}' ORDER BY column_name"
    response = client.execute_statement(
        resourceArn=cluster_arn,
        secretArn=secret_arn,
        database='geocoder',
        sql=sql
    )
    return [r[0]['stringValue'] for r in response['records']]

cluster_arn = "arn:aws:rds:ap-southeast-2:657416661258:cluster:aws-geocoding-aurora-cluster"
secret_arn = "arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt"

print("GNAF columns:", get_cols(cluster_arn, secret_arn, 'gnaf'))
print("GNAF_ALL columns:", get_cols(cluster_arn, secret_arn, 'gnaf_all'))
