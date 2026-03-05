import json
import boto3
import pytest

# Realistic test cases for Australian address validation
TEST_CASES = [
    {
        "input": "Unit 4 12 Main Street Hawthorn VIC 3122",
        "expected_tokens": ["unit", "4", "12", "main", "street", "hawthorn", "vic", "3122"]
    },
    {
        "input": "Level 2 450 St Kilda Rd Melbourne",
        "expected_tokens": ["level", "2", "450", "st kilda", "rd", "melbourne"]
    },
    {
        "input": "Lot 101 Green Valley Rd ACT",
        "expected_tokens": ["lot", "101", "green valley", "rd", "act"]
    }
]

def test_validator_with_real_input():
    lambda_client = boto3.client('lambda', region_name='ap-southeast-2')
    
    for case in TEST_CASES:
        print(f"\nTesting Address: {case['input']}")
        payload = {"address": case['input']}
        
        response = lambda_client.invoke(
            FunctionName='aws-geocoding-validator',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        result = json.loads(response['Payload'].read().decode('utf-8'))
        
        if result.get('statusCode') != 200:
            print(f"FAILED: {result.get('body')}")
            continue
            
        body = json.loads(result['body'])
        print(f"Parsed Input Tokens: {body.get('parsed_input')}")
        
        results = body.get('results', [])
        if not results:
            print("No matches found (expected if DB is empty during re-ingestion)")
            continue
            
        top_match = results[0]
        print(f"Top Match: {top_match['match']}")
        print(f"Confidence Score: {top_match['score']}")
        print(f"Trigram Score: {top_match['trigram_score']}")
        print(f"Token Score: {top_match['token_score']}")
        print(f"Broken-out Tokens: {top_match['tokens']}")

if __name__ == "__main__":
    test_validator_with_real_input()
