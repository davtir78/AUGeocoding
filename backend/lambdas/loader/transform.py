import os
import io
import csv
import zipfile
import boto3
from smart_open import open as smart_open

from config import logger, REGION

def handle_transform(mode, event, creds):
    if mode == 'TRANSFORM_GNAF':
        s3_bucket = event.get('s3_bucket')
        s3_key = event.get('s3_key') # raw/gnaf/national.zip
        output_key = event.get('output_key', 'raw/gnaf/national_transformed.psv')
        
        if not s3_bucket or not s3_key:
            raise ValueError("Missing s3_bucket or s3_key for TRANSFORM_GNAF")
            
        logger.info(f"Transforming s3://{s3_bucket}/{s3_key} to s3://{s3_bucket}/{output_key}")
        
        tmp_zip = "/tmp/national.zip"
        s3 = boto3.client('s3', region_name=REGION)
        
        logger.info("Downloading ZIP to /tmp...")
        s3.download_file(s3_bucket, s3_key, tmp_zip)
        
        states = ['ACT', 'NSW', 'NT', 'OT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']
        
        with zipfile.ZipFile(tmp_zip, 'r') as z:
            namelist = z.namelist()
            base_path = ""
            for name in namelist:
                if "/Standard/" in name:
                    base_path = name.split("/Standard/")[0] + "/Standard/"
                    break
            
            if not base_path:
                raise ValueError("Could not find '/Standard/' directory in G-NAF ZIP")
                
            logger.info(f"Found G-NAF base path: {base_path}")
            
            locality_map = {} 
            state_map = {}
            primary_map = {}

            for s in states:
                state_file = f"{base_path}{s}_STATE_psv.psv"
                if state_file in namelist:
                    with z.open(state_file) as f:
                        reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'), delimiter='|')
                        for row in reader:
                            state_map[row['STATE_PID']] = row['STATE_ABBREVIATION']

            for s in states:
                loc_file = f"{base_path}{s}_LOCALITY_psv.psv"
                if loc_file in namelist:
                    with z.open(loc_file) as f:
                        reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'), delimiter='|')
                        for row in reader:
                            s_abbr = state_map.get(row['STATE_PID'], s)
                            locality_map[row['LOCALITY_PID']] = (row['LOCALITY_NAME'], s_abbr)

            for s in states:
                rel_file = f"{base_path}{s}_PRIMARY_SECONDARY_psv.psv"
                if rel_file in namelist:
                    with z.open(rel_file) as f:
                        reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'), delimiter='|')
                        for row in reader:
                            primary_map[row['SECONDARY_PID']] = row['PRIMARY_PID']

            logger.info(f"Loaded {len(locality_map)} localities and {len(primary_map)} primary/secondary relationships.")

            with smart_open(f"s3://{s3_bucket}/{output_key}", 'wb') as fout:
                writer_text = io.TextIOWrapper(fout, encoding='utf-8')
                writer = csv.writer(writer_text, delimiter='|')
                writer.writerow(['gnaf_pid', 'primary_pid', 'primary_secondary', 'address_string', 'version', 'building_name', 'lot_number', 'flat_number', 'level_number', 'number_first', 'number_last', 'street_name', 'street_type', 'street_suffix', 'locality', 'state', 'postcode', 'longitude', 'latitude', 'geom'])
                
                for s in states:
                    logger.info(f"Processing {s}...")
                    
                    geocode_map = {}
                    geo_file = f"{base_path}{s}_ADDRESS_DEFAULT_GEOCODE_psv.psv"
                    if geo_file in namelist:
                        with z.open(geo_file) as f:
                            reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'), delimiter='|')
                            for row in reader:
                                geocode_map[row['ADDRESS_DETAIL_PID']] = (row['LATITUDE'], row['LONGITUDE'])
                    
                    street_map = {}
                    street_file = f"{base_path}{s}_STREET_LOCALITY_psv.psv"
                    if street_file in namelist:
                        with z.open(street_file) as f:
                            reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'), delimiter='|')
                            for row in reader:
                                street_map[row['STREET_LOCALITY_PID']] = (row['STREET_NAME'], row['STREET_TYPE_CODE'], row.get('STREET_SUFFIX_CODE', ''))
                    
                    addr_file = f"{base_path}{s}_ADDRESS_DETAIL_psv.psv"
                    if addr_file not in namelist:
                        continue
                        
                    with z.open(addr_file) as fin:
                        reader = csv.DictReader(io.TextIOWrapper(fin, encoding='utf-8'), delimiter='|')
                        for row in reader:
                            if row.get('DATE_RETIRED'): continue
                            g_pid = row['ADDRESS_DETAIL_PID']
                            lat, lon = geocode_map.get(g_pid, ("", ""))
                            
                            building = row['BUILDING_NAME'] or ""
                            lot = (row['LOT_NUMBER_PREFIX'] or "") + (row['LOT_NUMBER'] or "") + (row['LOT_NUMBER_SUFFIX'] or "")
                            flat = (row['FLAT_NUMBER_PREFIX'] or "") + (row['FLAT_NUMBER'] or "") + (row['FLAT_NUMBER_SUFFIX'] or "")
                            level = (row['LEVEL_NUMBER_PREFIX'] or "") + (row['LEVEL_NUMBER'] or "") + (row['LEVEL_NUMBER_SUFFIX'] or "")
                            num_f = (row['NUMBER_FIRST_PREFIX'] or "") + (row['NUMBER_FIRST'] or "") + (row['NUMBER_FIRST_SUFFIX'] or "")
                            num_l = (row['NUMBER_LAST_PREFIX'] or "") + (row['NUMBER_LAST'] or "") + (row['NUMBER_LAST_SUFFIX'] or "")
                            num_display = num_f if not num_l else f"{num_f}-{num_l}"
                            
                            street_name, street_type, street_suffix = "", "", ""
                            s_info = street_map.get(row['STREET_LOCALITY_PID'])
                            if s_info: street_name, street_type, street_suffix = s_info
                            street_full = f"{street_name} {street_type}".strip()
                            if street_suffix: street_full += f" {street_suffix}"
                            
                            loc_name, s_abbr = "", ""
                            l_info = locality_map.get(row['LOCALITY_PID'])
                            if l_info: loc_name, s_abbr = l_info
                            
                            postcode = row['POSTCODE']
                            parts = [p for p in [building, f"Level {level}" if level else "", f"Flat {flat}" if flat else "", f"Lot {lot}" if lot else "", num_display, street_full, loc_name, s_abbr, postcode] if p]
                            addr_str = " ".join(parts).strip()
                            
                            if addr_str:
                                geom = f"SRID=4326;POINT({lon} {lat})" if lat and lon else ""
                                p_pid = primary_map.get(g_pid, "")
                                p_sec = row.get('PRIMARY_SECONDARY', '')
                                writer.writerow([g_pid, p_pid, p_sec, addr_str, "CURRENT", building, lot, flat, level, num_f, num_l, street_name or "", street_type or "", street_suffix or "", loc_name, s_abbr, postcode, lon, lat, geom])
                writer_text.flush()

        if os.path.exists(tmp_zip):
            os.remove(tmp_zip)
            
        return {"status": "SUCCESS", "destination": f"s3://{s3_bucket}/{output_key}"}
    else:
        raise ValueError(f"Unknown transform mode: {mode}")
