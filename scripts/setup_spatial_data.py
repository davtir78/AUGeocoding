import os
import requests
import zipfile
import shutil
from pathlib import Path

# URLs for ABS Digital Boundary Files
LGA_URL = "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/LGA_2025_AUST_GDA2020.zip"
MB_URL = "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/MB_2021_AUST_SHP_GDA2020.zip"

TEMP_DIR = Path("temp_data")
LGA_DIR = TEMP_DIR / "lga"
MB_DIR = TEMP_DIR / "mesh_block"

def download_file(url, dest_path):
    print(f"Downloading {url}...")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
    with requests.get(url, headers=headers, stream=True) as r:
        r.raise_for_status()
        with open(dest_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    print(f"Downloaded to {dest_path}")

def unzip_file(zip_path, extract_to):
    print(f"Unzipping {zip_path} to {extract_to}...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    print("Unzipped.")

def main():
    TEMP_DIR.mkdir(exist_ok=True)
    LGA_DIR.mkdir(exist_ok=True)
    MB_DIR.mkdir(exist_ok=True)

    # LGA
    lga_zip = LGA_DIR / "lga.zip"
    if not lga_zip.exists():
        download_file(LGA_URL, lga_zip)
    else:
        print("LGA zip already exists.")
    
    unzip_file(lga_zip, LGA_DIR)

    # Mesh Block
    mb_zip = MB_DIR / "mb.zip"
    if not mb_zip.exists():
        download_file(MB_URL, mb_zip)
    else:
        print("Mesh Block zip already exists.")
    
    unzip_file(mb_zip, MB_DIR)
    
    print("\nVerifying Shapefiles:")
    lga_shp = list(LGA_DIR.glob("*.shp"))
    mb_shp = list(MB_DIR.glob("*.shp"))
    
    if lga_shp:
        print(f"LGA Shapefile found: {lga_shp[0]}")
    else:
        print("WARNING: LGA Shapefile NOT found!")

    if mb_shp:
        print(f"Mesh Block Shapefile found: {mb_shp[0]}")
    else:
        print("WARNING: Mesh Block Shapefile NOT found!")

if __name__ == "__main__":
    main()
