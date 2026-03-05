import subprocess
import os
import sys

def run_script(name, path):
    print(f"\n{'='*60}")
    print(f" RUNNING: {name}")
    print(f"{'='*60}")
    try:
        # Using sys.executable to ensure we use the same python environment
        result = subprocess.run([sys.executable, path], check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"!! ERROR running {name}: {e}")
        return False

def main():
    print("Starting Geocoding Verification Suite...")
    
    scripts = [
        ("Database Warm-up", "tests/warmup_db.py"),
        ("Quality Test Suite", "tests/quality_test_suite.py"),
        ("Performance Benchmark", "tests/performance_benchmark.py")
    ]
    
    results = []
    for name, path in scripts:
        if not os.path.exists(path):
            print(f"Warning: Script {path} not found. Skipping.")
            continue
            
        success = run_script(name, path)
        results.append((name, success))
    
    print(f"\n{'='*60}")
    print(" VERIFICATION SUMMARY")
    print(f"{'='*60}")
    all_success = True
    for name, success in results:
        status = "PASSED" if success else "FAILED"
        print(f"{name:.<40} {status}")
        if not success:
            all_success = False
            
    if all_success:
        print("\nSUCCESS: All verification stages completed successfully!")
    else:
        print("\nWARNING: Some verification stages failed. Check reports in docs/ directory.")

if __name__ == "__main__":
    main()
