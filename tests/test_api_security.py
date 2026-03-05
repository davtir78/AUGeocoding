"""
Security Test Suite — Sprint 7.1: API Security
Tests JWT authentication enforcement on API Gateway endpoints.

Usage:
    python tests/test_api_security.py

Requires:
    - pip install requests boto3
    - Valid Cognito user credentials (use scripts/create_test_user.sh)
    - API deployed with JWT authorizer (terraform apply)
"""

import json
import os
import subprocess
import time
import unittest

import boto3
import requests

# Configuration — these can be overridden via environment variables
REGION = os.environ.get("AWS_REGION", "ap-southeast-2")
API_URL = os.environ.get("API_URL", "https://YOUR_API_ID.execute-api.ap-southeast-2.amazonaws.com")

# Test user credentials — set via environment or use defaults
TEST_EMAIL = os.environ.get("TEST_EMAIL", "")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD", "")


def get_terraform_output(key):
    """Retrieve a value from Terraform outputs."""
    try:
        result = subprocess.run(
            ["terraform", "output", "-raw", key],
            cwd=os.path.join(os.path.dirname(__file__), "..", "terraform"),
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def get_jwt_token(user_pool_client_id, email, password):
    """Authenticate with Cognito and return an access token."""
    client = boto3.client("cognito-idp", region_name=REGION)
    response = client.initiate_auth(
        ClientId=user_pool_client_id,
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={
            "USERNAME": email,
            "PASSWORD": password,
        }
    )
    return response["AuthenticationResult"]["AccessToken"]


class TestAPISecurityUnauthenticated(unittest.TestCase):
    """Tests that unauthenticated requests are rejected on protected routes."""

    def test_geocode_without_token_returns_401(self):
        """POST /geocode without Authorization header should return 401."""
        resp = requests.post(f"{API_URL}/geocode", json={"address": "1 Martin Pl Sydney"})
        self.assertEqual(resp.status_code, 401, f"Expected 401, got {resp.status_code}: {resp.text}")

    def test_refresh_get_without_token_returns_401(self):
        """GET /refresh without Authorization header should return 401."""
        resp = requests.get(f"{API_URL}/refresh")
        self.assertEqual(resp.status_code, 401, f"Expected 401, got {resp.status_code}: {resp.text}")

    def test_refresh_post_without_token_returns_401(self):
        """POST /refresh without Authorization header should return 401."""
        resp = requests.post(f"{API_URL}/refresh", json={})
        self.assertEqual(resp.status_code, 401, f"Expected 401, got {resp.status_code}: {resp.text}")

    def test_refresh_health_without_token_returns_401(self):
        """GET /refresh/health without Authorization header should return 401."""
        resp = requests.get(f"{API_URL}/refresh/health")
        self.assertEqual(resp.status_code, 401, f"Expected 401, got {resp.status_code}: {resp.text}")

    def test_invalid_token_returns_401(self):
        """POST /geocode with an invalid Bearer token should return 401."""
        headers = {"Authorization": "Bearer invalid-token-12345"}
        resp = requests.post(f"{API_URL}/geocode", json={"address": "test"}, headers=headers)
        self.assertEqual(resp.status_code, 401, f"Expected 401, got {resp.status_code}: {resp.text}")

    def test_expired_token_returns_401(self):
        """POST /geocode with an expired JWT should return 401."""
        # This is a structurally valid but expired JWT
        expired_jwt = (
            "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxNjAwMDAwMDAwfQ."
            "invalid_signature"
        )
        headers = {"Authorization": f"Bearer {expired_jwt}"}
        resp = requests.post(f"{API_URL}/geocode", json={"address": "test"}, headers=headers)
        self.assertEqual(resp.status_code, 401, f"Expected 401, got {resp.status_code}: {resp.text}")


class TestCORSPreflight(unittest.TestCase):
    """Tests that CORS preflight (OPTIONS) works without authentication."""

    def test_options_without_token_returns_ok(self):
        """OPTIONS requests should be allowed without authentication for CORS."""
        resp = requests.options(f"{API_URL}/geocode")
        # OPTIONS should return 200 or 204 (No Content)
        self.assertIn(resp.status_code, [200, 204],
                      f"Expected 200 or 204 for OPTIONS, got {resp.status_code}")


@unittest.skipIf(not TEST_EMAIL or not TEST_PASSWORD,
                 "Set TEST_EMAIL and TEST_PASSWORD environment variables to run authenticated tests")
class TestAPISecurityAuthenticated(unittest.TestCase):
    """Tests that authenticated requests are accepted."""

    @classmethod
    def setUpClass(cls):
        """Authenticate once and reuse the token for all tests."""
        client_id = get_terraform_output("user_pool_client_id")
        if not client_id:
            raise unittest.SkipTest("Cannot retrieve user_pool_client_id from Terraform")
        cls.token = get_jwt_token(client_id, TEST_EMAIL, TEST_PASSWORD)
        cls.headers = {"Authorization": f"Bearer {cls.token}"}

    def test_geocode_with_token_returns_200(self):
        """POST /geocode with a valid JWT should return 200."""
        resp = requests.post(
            f"{API_URL}/geocode",
            json={"address": "1 Martin Pl Sydney"},
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 200, f"Expected 200, got {resp.status_code}: {resp.text}")

        # Verify response contains geocoding results
        data = resp.json()
        self.assertIn("results", data)
        self.assertTrue(len(data["results"]) > 0, "Expected at least one result")

    def test_geocode_result_contains_expected_fields(self):
        """Authenticated geocode should return full result fields."""
        resp = requests.post(
            f"{API_URL}/geocode",
            json={"address": "510 Little Collins St Melbourne"},
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 200)
        result = resp.json()["results"][0]

        # Verify core fields exist
        for field in ["gnaf_pid", "address", "confidence", "coordinates"]:
            self.assertIn(field, result, f"Missing field: {field}")

    def test_refresh_health_with_token_returns_200(self):
        """GET /refresh/health with a valid JWT should return 200."""
        resp = requests.get(f"{API_URL}/refresh/health", headers=self.headers)
        self.assertEqual(resp.status_code, 200, f"Expected 200, got {resp.status_code}: {resp.text}")

    def test_token_performance(self):
        """Authenticated requests should not add significant latency."""
        latencies = []
        for _ in range(5):
            start = time.time()
            resp = requests.post(
                f"{API_URL}/geocode",
                json={"address": "1 Martin Pl Sydney"},
                headers=self.headers
            )
            latencies.append(time.time() - start)
            self.assertEqual(resp.status_code, 200)

        avg_latency = sum(latencies) / len(latencies)
        print(f"\n  Avg authenticated latency: {avg_latency:.3f}s (over 5 requests)")
        # Allow up to 3 seconds avg to account for Lambda cold starts in dev
        self.assertLess(avg_latency, 3.0, f"Average latency too high: {avg_latency:.3f}s")


if __name__ == "__main__":
    print(f"API URL: {API_URL}")
    print(f"Region:  {REGION}")
    print(f"Auth:    {'Credentials provided' if TEST_EMAIL else 'Unauthenticated tests only'}")
    print()
    unittest.main(verbosity=2)
