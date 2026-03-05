import requests
import json
import time
import os

API_URL = os.environ.get("API_URL", "https://YOUR_API_ID.execute-api.ap-southeast-2.amazonaws.com/geocode")

test_cases = [
    {"input": "1 martin pl sydney", "expected_contain": "1 MARTIN PLACE"},
    {"input": "510 Little Collins St Melbourne VIC 3000", "expected_contain": "510 LITTLE COLLINS"},
    {"input": "Unit 5 100 St Georges Tce Perth", "expected_contain": "FLAT 5"},
]

def run_test(address):
    payload = {"address": address}
    
    print(f"\nTesting: '{address}'")
    start_time = time.time()
    try:
        response = requests.post(API_URL, json=payload)
        latency = time.time() - start_time
        
        print(f"Status: {response.status_code} (Latency: {latency:.4f}s)")
        
        if response.status_code != 200:
            print(f"  Error Body: {response.text}")
            return

        result_payload = response.json()
        
        result_payload = response.json()
        
        results = result_payload.get("results", [])
        
        if results:
            print(f"Found {len(results)} results:")
            for i, res in enumerate(results[:3]): # Show top 3
                print(f"  {i+1}. {res.get('gnaf_pid')} - {res.get('address')} (Confidence: {res.get('confidence')}%)")
                print(f"     Tokens: {res.get('tokens')}")
        else:
            print("  No results found.")
            
    except Exception as e:
        print(f"  Error: {e}")

if __name__ == "__main__":
    for case in test_cases:
        run_test(case["input"])
