import requests
import json
import time
import os

API_URL = os.environ.get("API_URL", "https://YOUR_API_ID.execute-api.ap-southeast-2.amazonaws.com/geocode")

coverage_sample = [
    {"state": "NSW", "address": "1 Martin Pl Sydney NSW 2000"},
    {"state": "VIC", "address": "100 Elizabeth St Melbourne VIC 3000"},
    {"state": "QLD", "address": "100 Queen St Brisbane QLD 4000"},
    {"state": "WA", "address": "100 St Georges Tce Perth WA 6000"},
    {"state": "SA", "address": "100 King William St Adelaide SA 5000"},
    {"state": "TAS", "address": "100 Elizabeth St Hobart TAS 7000"},
    {"state": "ACT", "address": "100 London Cct Canberra ACT 2601"},
    {"state": "NT", "address": "100 Mitchell St Darwin NT 0800"}
]

def check_coverage():
    print(f"Starting National Coverage Audit...")
    all_pass = True
    for item in coverage_sample:
        state = item["state"]
        address = item["address"]
        print(f"Checking {state:.<5} {address:.<40}", end="", flush=True)
        
        try:
            res = requests.post(API_URL, json={"address": address})
            data = res.json()
            results = data.get("results", [])
            
            if results and results[0].get("confidence", 0) > 80:
                print(" ✅ OK")
            else:
                print(" ❌ FAIL")
                all_pass = False
        except Exception as e:
            print(f" ❌ ERROR: {e}")
            all_pass = False
            
    if all_pass:
        print("\nSUCCESS: All AU states and territories verified in the national load.")
    else:
        print("\nFAILURE: Some regions are missing or returning poor results.")

if __name__ == "__main__":
    check_coverage()
