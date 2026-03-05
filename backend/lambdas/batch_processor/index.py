import os
import json
import boto3
import csv
import io
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')

RESULTS_BUCKET = os.environ['RESULTS_BUCKET_NAME']
VALIDATOR_FUNCTION = os.environ['VALIDATOR_FUNCTION_NAME']
MAX_WORKERS = 5  # Parallel invocations

def handler(event, context):
    try:
        for record in event['Records']:
            process_record(record)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Batch processing failed: {e}", exc_info=True)
        raise e

def process_record(record):
    src_bucket = record['s3']['bucket']['name']
    src_key = record['s3']['object']['key']
    
    # Only process .csv
    if not src_key.endswith('.csv'):
        logger.info(f"Skipping non-csv file: {src_key}")
        return

    logger.info(f"Processing {src_bucket}/{src_key}")
    
    # 1. Download CSV
    response = s3.get_object(Bucket=src_bucket, Key=src_key)
    body = response['Body'].read().decode('utf-8')
    
    # 2. Parse CSV
    lines = [l.strip() for l in body.splitlines() if l.strip()]

    if not lines:
        return

    # Sniff ONLY for unambiguous delimiters (tab, pipe, semicolon).
    # Comma is intentionally excluded: it appears inside address strings and
    # causes the sniffer to incorrectly split "300 La Trobe St, Sydney NSW" into
    # two columns. We only treat a file as multi-column when:
    #   (a) a non-comma delimiter is detected, OR
    #   (b) the first row looks like a quoted CSV header with a known address field.
    buff = io.StringIO('\n'.join(lines[:20]))
    is_multi_col = False
    has_header = False
    dialect = None

    try:
        dialect = csv.Sniffer().sniff(buff.read(), delimiters='\t|;')
        # Non-comma delimiter found — genuine structured CSV
        is_multi_col = True
        buff.seek(0)
        has_header = csv.Sniffer().has_header(buff.read())
    except Exception:
        # No unambiguous delimiter found.
        # Last chance: check if the first line looks like a quoted CSV header
        # containing a column named 'address' (e.g. from Excel export).
        first_line = lines[0].lower()
        if first_line.startswith('"') and 'address' in first_line:
            dialect = 'excel'
            is_multi_col = True
            has_header = True

    if is_multi_col:
        buff = io.StringIO('\n'.join(lines))
        reader = csv.reader(buff, dialect=dialect)
        rows = list(reader)
        if not rows:
            return
        if has_header:
            header = rows[0]
            data_rows = rows[1:]
        else:
            header = [f"col_{i}" for i in range(len(rows[0]))]
            data_rows = rows

        # Find address column (heuristic: 'address' in name, else first col)
        address_col_idx = 0
        for i, col in enumerate(header):
            if 'address' in col.lower():
                address_col_idx = i
                break

        # Collapse all original columns into a single input_address for output
        output_original_header = ['input_address']
        data_rows = [[' '.join(r).strip()] for r in data_rows]
        header = output_original_header
        address_col_idx = 0
    else:
        # Plain text: one address per line
        header = ['input_address']
        data_rows = [[line] for line in lines]
        address_col_idx = 0

            
    # 3. Process Rows in Parallel
    results = [None] * len(data_rows)
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_idx = {
            executor.submit(geocode_address, row[address_col_idx]): i 
            for i, row in enumerate(data_rows)
            if len(row) > address_col_idx # Check row has enough cols
        }
        
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                res = future.result()
                results[idx] = res
            except Exception as e:
                logger.error(f"Row {idx} failed: {e}")
                results[idx] = {"error": str(e)}

    # 4. Write Output CSV
    output_buff = io.StringIO()
    # Add new headers
    output_header = header + [
        'geocode_status',
        'geocode_matched_address',
        'geocode_confidence',
        'geocode_gnaf_pid',
        'geocode_lat',
        'geocode_lon',
        # Parsed address components
        'geocode_unit',
        'geocode_level',
        'geocode_number',
        'geocode_street_name',
        'geocode_street_type',
        'geocode_suburb',
        'geocode_state',
        'geocode_postcode',
        # Spatial enrichment
        'geocode_lga',
        'geocode_lga_code',
        'geocode_mmm_2015',
        'geocode_mmm_2019',
        'geocode_mmm_2023',
    ]
    writer = csv.writer(output_buff)
    writer.writerow(output_header)
    
    for i, row in enumerate(data_rows):
        res = results[i] or {}
        matched_addr = res.get('address', '')
        confidence = res.get('confidence', '')
        pid = res.get('gnaf_pid', '')
        lat = res.get('coordinates', {}).get('latitude', '')
        lon = res.get('coordinates', {}).get('longitude', '')
        
        lga_name = ''
        lga_code = ''
        if res.get('lga'):
            lga_name = res['lga'][0].get('lga_name', '')
            lga_code = res['lga'][0].get('lga_code', '')
            
        # MMM — pivot by year into separate columns
        mmm_by_year = {}
        for region in (res.get('mmm_regions') or []):
            yr = str(region.get('year', ''))
            mmm_by_year[yr] = region.get('mmm_code', '')
        mmm_2015 = mmm_by_year.get('2015', '')
        mmm_2019 = mmm_by_year.get('2019', '')
        mmm_2023 = mmm_by_year.get('2023', '')
            
        # Address component tokens
        t = res.get('tokens') or {}
        pt = res.get('parsed_tokens') or {}
        
        # Use G-NAF values, fallback to input-parsed values if G-NAF matched the base building
        unit      = t.get('flat') or pt.get('flat', '')
        level     = t.get('level') or pt.get('level', '')
        number    = t.get('number', '')
        street_name = t.get('street_name', '')
        street_type = t.get('street_type', '')
        if t.get('street_suffix'):
            street_type = f"{street_type} {t['street_suffix']}".strip()
        suburb    = t.get('locality_name') or t.get('locality', '')
        state     = t.get('state', '')
        postcode  = t.get('postcode', '')

        status = 'MATCHED' if matched_addr else 'NO_MATCH'
        new_row = row + [
            status, matched_addr, confidence, pid, lat, lon,
            unit, level, number, street_name, street_type, suburb, state, postcode,
            lga_name, lga_code, mmm_2015, mmm_2019, mmm_2023
        ]
        writer.writerow(new_row)
        
    # 5. Upload to Results Bucket
    # Key: uploads/JOBID.csv -> results/JOBID_results.csv
    # job_id is filename without extension
    filename = os.path.basename(src_key)
    job_id = os.path.splitext(filename)[0]
    result_key = f"results/{job_id}_results.csv"
    
    s3.put_object(
        Bucket=RESULTS_BUCKET,
        Key=result_key,
        Body=output_buff.getvalue(),
        ContentType='text/csv'
    )
    logger.info(f"Results written to {RESULTS_BUCKET}/{result_key}")

def geocode_address(address):
    """Invoke Validator Lambda."""
    # Handle empty
    if not address or not address.strip():
        return {}

    payload = {"address": address}
    resp = lambda_client.invoke(
        FunctionName=VALIDATOR_FUNCTION,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload)
    )
    # Parse response
    resp_payload = json.loads(resp['Payload'].read())
    
    if 'body' in resp_payload:
        body = json.loads(resp_payload['body']) if isinstance(resp_payload['body'], str) else resp_payload['body']
        if 'results' in body and body['results']:
            # Return best match, enriched with original parsed tokens
            best_match = body['results'][0]
            best_match['parsed_tokens'] = body.get('parsed_tokens', {})
            return best_match
    return {}
