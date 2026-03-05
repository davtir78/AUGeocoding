import requests
import json
import time
import os
import subprocess
from datetime import datetime

# Configuration
API_URL = os.environ.get("API_URL", "https://YOUR_API_ID.execute-api.ap-southeast-2.amazonaws.com/geocode")
REGION = os.environ.get("AWS_REGION", "ap-southeast-2")

# JWT Authentication Support
def get_auth_headers():
    """Get JWT auth headers if credentials are available."""
    email = os.environ.get("TEST_EMAIL", "")
    password = os.environ.get("TEST_PASSWORD", "")
    if not email or not password:
        print("⚠️  No TEST_EMAIL/TEST_PASSWORD set — running WITHOUT authentication")
        return {}
    
    try:
        import boto3
        # Get client ID from Terraform
        result = subprocess.run(
            ["terraform", "output", "-raw", "user_pool_client_id"],
            cwd=os.path.join(os.path.dirname(__file__), "..", "terraform"),
            capture_output=True, text=True, timeout=10
        )
        client_id = result.stdout.strip()
        
        client = boto3.client("cognito-idp", region_name=REGION)
        response = client.initiate_auth(
            ClientId=client_id,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": password}
        )
        token = response["AuthenticationResult"]["AccessToken"]
        print(f"🔐 Authenticated as: {email}")
        return {"Authorization": f"Bearer {token}"}
    except Exception as e:
        print(f"⚠️  Auth failed ({e}) — running WITHOUT authentication")
        return {}

AUTH_HEADERS = get_auth_headers()

# Test Cases
test_cases = [
    {"input": "510 Little Collins St Melbourne VIC 3000", "category": "Exact Match", "expected": "510 LITTLE COLLINS STREET MELBOURNE VIC 3000"},
    {"input": "510 Litle Colins St Melbourne VIC 3000", "category": "Typo (Street)", "expected": "510 LITTLE COLLINS STREET MELBOURNE VIC 3000"},
    {"input": "510 Little Collins St Melbourn VIC 3000", "category": "Typo (Locality)", "expected": "510 LITTLE COLLINS STREET MELBOURNE VIC 3000"},
    {"input": "510 Little Collins St Melbourne 3000", "category": "Missing State", "expected": "510 LITTLE COLLINS STREET MELBOURNE VIC 3000"},
    {"input": "510 Little Collins St VIC 3000", "category": "Missing Locality", "expected": "510 LITTLE COLLINS STREET MELBOURNE VIC 3000"},
    {"input": "510 Little Collins Street Melbourne", "category": "Abbreviation & Missing Postcode", "expected": "510 LITTLE COLLINS STREET MELBOURNE VIC 3000"},
    {"input": "Unit 5 100 St Georges Tce Perth", "category": "Unit Number & Abbreviation", "expected": "FLAT 5 100 ST GEORGES TERRACE PERTH WA 6000"},
    {"input": "85 Spring St East Melb", "category": "Locality Abbreviation", "expected": "85 SPRING STREET EAST MELBOURNE VIC 3002"},
    {"input": "1 martin pl sydney", "category": "Regression (Building vs Unit)", "expected": "1 MARTIN PLACE SYDNEY NSW 2000"},
]

def run_test(address):
    payload = {"address": address}
    
    start_time = time.time()
    try:
        response = requests.post(API_URL, json=payload, headers=AUTH_HEADERS)
        latency = time.time() - start_time
        
        result_payload = response.json()
        results = result_payload.get("results", [])
        
        if results:
            best_match = results[0]
            return {
                "matched": best_match.get("address", "No Address"),
                "score": round(best_match.get("confidence", 0), 2),
                "latency": round(latency, 4),
                "status": "Success" if response.status_code == 200 else f"Error HTTP {response.status_code}"
            }
        else:
            return {
                "matched": "No Match",
                "score": 0,
                "latency": round(latency, 4),
                "status": "No Results"
            }
    except Exception as e:
        return {
            "matched": "ERROR",
            "score": 0,
            "latency": round(time.time() - start_time, 4),
            "status": str(e)
        }

def generate_report(results):
    report_path = "docs/geocoding_quality_report.md"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    with open(report_path, "w") as f:
        f.write(f"# Geocoding Quality Report\n\n")
        f.write(f"**Generated at:** {now}\n\n")
        f.write(f"| Category | Input Address | Matched Address | Confidence | Time (s) | Status |\n")
        f.write(f"| :--- | :--- | :--- | :--- | :--- | :--- |\n")
        
        for res in results:
            f.write(f"| {res['category']} | {res['input']} | {res['matched']} | {res['score']} | {res['latency']} | {res['status']} |\n")
    
    print(f"Report generated: {report_path}")

if __name__ == "__main__":
    results = []
    print(f"Running quality test suite against {API_URL}...")
    for case in test_cases:
        print(f"Testing: {case['input']} ({case['category']})")
        res = run_test(case["input"])
        res.update(case)
        results.append(res)
        
    generate_report(results)
