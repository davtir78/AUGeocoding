import boto3
import json
import time
import statistics

# Configuration
FUNCTION_NAME = "aws-geocoding-validator"
REGION = "ap-southeast-2"

# A larger set of addresses for benchmarking
bench_addresses = [
    "1 Martin Pl Sydney NSW 2000",
    "510 Little Collins St Melbourne VIC 3000",
    "Unit 5 100 St Georges Tce Perth WA 6000",
    "85 Spring St East Melbourne VIC 3002",
    "100 Harris St Pyrmont NSW 2009",
    "Level 5 48 Market St Sydney NSW 2000",
    "161 Castlereagh St Sydney NSW 2000",
    "727 George St Haymarket NSW 2000",
    "2 Chifley Square Sydney NSW 2000",
    "10 Bridge St Sydney NSW 2000"
] * 10 # 100 total requests

def benchmark():
    lambda_client = boto3.client("lambda", region_name=REGION)
    latencies = []
    
    print(f"Starting benchmark: 10 batches of 10 requests ({len(bench_addresses)} total)...")
    
    for i, address in enumerate(bench_addresses):
        payload = {"body": json.dumps({"address": address})}
        
        start = time.time()
        try:
            lambda_client.invoke(
                FunctionName=FUNCTION_NAME,
                InvocationType="RequestResponse",
                Payload=json.dumps(payload)
            )
            duration = time.time() - start
            latencies.append(duration)
            if (i+1) % 10 == 0:
                print(f"Completed {i+1}/{len(bench_addresses)} requests...")
        except Exception as e:
            print(f"Request {i+1} failed: {e}")

    if not latencies:
        print("No successful requests to analyze.")
        return

    # Results
    stats = {
        "Total Requests": len(latencies),
        "Avg Latency (s)": round(statistics.mean(latencies), 4),
        "Median Latency (s)": round(statistics.median(latencies), 4),
        "P95 Latency (s)": round(statistics.quantiles(latencies, n=20)[18], 4),
        "Max Latency (s)": round(max(latencies), 4),
        "Min Latency (s)": round(min(latencies), 4)
    }
    
    print("\n--- Benchmark Results ---")
    for k, v in stats.items():
        print(f"{k}: {v}")
    
    with open("docs/performance_benchmark_results.md", "w") as f:
        f.write("# Geocoding Performance Benchmark\n\n")
        f.write(f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("| Metric | Value |\n")
        f.write("| :--- | :--- |\n")
        for k, v in stats.items():
            f.write(f"| {k} | {v} |\n")
            
    print(f"\nReport written to docs/performance_benchmark_results.md")

if __name__ == "__main__":
    benchmark()
