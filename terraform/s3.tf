# Random suffix for bucket names to ensure uniqueness
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Raw Data Bucket (Batch Uploads)
resource "aws_s3_bucket" "raw_bucket" {
  bucket = "aws-geocoding-raw-${random_string.suffix.result}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_bucket_enc" {
  bucket = aws_s3_bucket.raw_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "raw_bucket_ver" {
  bucket = aws_s3_bucket.raw_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_cors_configuration" "raw_bucket_cors" {
  bucket = aws_s3_bucket.raw_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Reference Data Bucket (G-NAF, MMM)
resource "aws_s3_bucket" "ref_bucket" {
  bucket = "aws-geocoding-ref-${random_string.suffix.result}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ref_bucket_enc" {
  bucket = aws_s3_bucket.ref_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "ref_bucket_ver" {
  bucket = aws_s3_bucket.ref_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Results Bucket (Batch Output)
resource "aws_s3_bucket" "results_bucket" {
  bucket = "aws-geocoding-results-${random_string.suffix.result}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "results_bucket_enc" {
  bucket = aws_s3_bucket.results_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "results_bucket_cors" {
  bucket = aws_s3_bucket.results_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag", "Content-Disposition"]
    max_age_seconds = 3000
  }
}
