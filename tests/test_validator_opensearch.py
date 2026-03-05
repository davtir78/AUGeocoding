"""
AU Geocoding Platform — Validator Lambda Integration Tests
Tests the OpenSearch-backed Validator against common address entry patterns.

Usage:
    python tests/test_validator_opensearch.py
    python tests/test_validator_opensearch.py --save   # saves results to tests/results/
"""

import json
import boto3
import time
import sys
import os
from datetime import datetime

FUNCTION_NAME = "aws-geocoding-validator"
REGION = "ap-southeast-2"
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")

# ─── Test Cases ──────────────────────────────────────────────────
TEST_CASES = [
    # (Category, Input Address, Expected Substring in Top Match)

    # --- Spacing & Casing ---
    ("Spacing & Casing", "6   packham   place   charnwood",             "PACKHAM PLACE CHARNWOOD"),
    ("Spacing & Casing", "6 packham place, charnwood, act, 2615",       "PACKHAM PLACE CHARNWOOD"),
    ("Spacing & Casing", "6 PACKHAM PLACE CHARNWOOD ACT 2615",         "PACKHAM PLACE CHARNWOOD"),
    ("Spacing & Casing", "6 packham place charnwood act 2615",          "PACKHAM PLACE CHARNWOOD"),
    ("Spacing & Casing", "6 PaCkHaM pLaCe ChArNwOoD",                  "PACKHAM PLACE CHARNWOOD"),

    # --- Abbreviations ---
    ("Abbreviations", "3 bunker pl charnwood",                          "BUNKER PLACE CHARNWOOD"),
    ("Abbreviations", "26 jauncey ct charnwood act",                    "JAUNCEY COURT CHARNWOOD"),
    ("Abbreviations", "6 packham charnwood",                            "PACKHAM"),

    # --- Typos & Misspellings ---
    ("Typos", "6 pakham place charnwood",                               "PACKHAM PLACE CHARNWOOD"),
    ("Typos", "3 bunker place charnwod",                                "BUNKER PLACE CHARNWOOD"),
    ("Typos", "26 jauncey courrt charnwood",                            "JAUNCEY COURT CHARNWOOD"),
    ("Typos", "3 bnuker place charnwood",                               "BUNKER PLACE CHARNWOOD"),

    # --- Unit / Flat Notation ---
    ("Unit Notation", "1/3 bunker place charnwood",                     "BUNKER PLACE CHARNWOOD"),
    ("Unit Notation", "unit 1 3 bunker place charnwood",                "BUNKER PLACE CHARNWOOD"),

    # --- Missing Components ---
    ("Missing Fields", "6 packham place charnwood act",                 "PACKHAM PLACE CHARNWOOD"),
    ("Missing Fields", "6 packham place charnwood",                     "PACKHAM PLACE CHARNWOOD"),
    ("Missing Fields", "packham place charnwood",                       "PACKHAM PLACE CHARNWOOD"),
    ("Missing Fields", "charnwood act 2615",                            "CHARNWOOD"),

    # --- Reordered Input ---
    ("Reordered", "2615 charnwood packham place 6",                     "PACKHAM PLACE CHARNWOOD"),
]


def invoke_validator(address: str) -> tuple:
    """Invoke the Validator Lambda and return (body_dict, elapsed_ms)."""
    client = boto3.client("lambda", region_name=REGION)
    start = time.time()
    resp = client.invoke(
        FunctionName=FUNCTION_NAME,
        Payload=json.dumps({"address": address}),
    )
    elapsed = (time.time() - start) * 1000
    payload = json.loads(resp["Payload"].read())
    body = json.loads(payload.get("body", "{}"))
    return body, elapsed


def run_tests() -> list:
    """Run all test cases and return a list of result dicts."""
    results = []
    passed = 0
    failed = 0

    current_category = None
    for category, address, expected_substr in TEST_CASES:
        if category != current_category:
            current_category = category
            print(f"\n  [{category}]")

        body, elapsed = invoke_validator(address)
        top = body["results"][0] if body.get("results") else None
        match_addr = top["address"] if top else "NO MATCH"
        confidence = top["confidence"] if top else 0
        ok = expected_substr.upper() in match_addr.upper() if top else False

        status = "PASS" if ok else "FAIL"
        icon = "[PASS]" if ok else "[FAIL]"
        if ok:
            passed += 1
        else:
            failed += 1

        print(f"  {icon} {address:<45} → {match_addr:<50} {confidence:>5.1f}%  {elapsed:>5.0f}ms")

        results.append({
            "category": category,
            "input": address,
            "expected_contains": expected_substr,
            "matched_address": match_addr,
            "confidence": confidence,
            "latency_ms": round(elapsed),
            "status": status,
        })

    print(f"\n{'=' * 80}")
    print(f"  Results: {passed} passed, {failed} failed, {len(results)} total")
    print(f"{'=' * 80}")
    return results


def save_results(results: list):
    """Save results to a timestamped JSON file and a markdown summary."""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # --- JSON ---
    json_path = os.path.join(RESULTS_DIR, f"validator_test_{timestamp}.json")
    with open(json_path, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "function": FUNCTION_NAME,
            "total_tests": len(results),
            "passed": sum(1 for r in results if r["status"] == "PASS"),
            "failed": sum(1 for r in results if r["status"] == "FAIL"),
            "avg_latency_ms": round(sum(r["latency_ms"] for r in results) / len(results)),
            "results": results,
        }, f, indent=2)
    print(f"  JSON saved: {json_path}")

    # --- Markdown ---
    md_path = os.path.join(RESULTS_DIR, f"validator_test_{timestamp}.md")
    passed = sum(1 for r in results if r["status"] == "PASS")
    avg_ms = round(sum(r["latency_ms"] for r in results) / len(results))
    with open(md_path, "w") as f:
        f.write(f"# Validator Test Results — {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
        f.write(f"**Function**: `{FUNCTION_NAME}`  \n")
        f.write(f"**Results**: {passed}/{len(results)} passed  \n")
        f.write(f"**Avg Latency**: {avg_ms}ms  \n\n")
        f.write(f"| Status | Category | Input | Match | Conf | ms |\n")
        f.write(f"|:-------|:---------|:------|:------|-----:|---:|\n")
        for r in results:
            icon = "PASS" if r["status"] == "PASS" else "FAIL"
            f.write(f"| {icon} | {r['category']} | `{r['input']}` | {r['matched_address'][:45]} | {r['confidence']}% | {r['latency_ms']} |\n")
    print(f"  Markdown saved: {md_path}")


if __name__ == "__main__":
    print("=" * 80)
    print("  AU Geocoding — Validator OpenSearch Integration Tests")
    print("=" * 80)

    results = run_tests()

    if "--save" in sys.argv:
        print()
        save_results(results)
    else:
        print("\n  Tip: Run with --save to persist results to tests/results/")
