FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for psycopg2 (if using source build, but binary should be fine)
# and curl/unzip if needed for debugging
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY transform_gnaf.py .
COPY entrypoint.py .

CMD ["python", "entrypoint.py"]
