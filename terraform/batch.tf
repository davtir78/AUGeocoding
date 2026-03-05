# ECR Repositories
resource "aws_ecr_repository" "batch_api_repo" {
  name                 = "aws-geocoding-batch-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_repository" "batch_processor_repo" {
  name                 = "aws-geocoding-batch-processor"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

# ------------------------------------------------------------------------------
# Batch API Lambda (Presigned URLs)
# ------------------------------------------------------------------------------
resource "aws_lambda_function" "batch_api_lambda" {
  function_name = "aws-geocoding-batch-api"
  role          = aws_iam_role.batch_api_role.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.batch_api_repo.repository_url}:latest"
  timeout       = 10
  memory_size   = 128

  environment {
    variables = {
      RAW_BUCKET_NAME     = aws_s3_bucket.raw_bucket.bucket
      RESULTS_BUCKET_NAME = aws_s3_bucket.results_bucket.bucket
    }
  }
}

resource "aws_iam_role" "batch_api_role" {
  name = "aws-geocoding-batch-api-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "batch_api_policy" {
  name = "aws-geocoding-batch-api-policy"
  role = aws_iam_role.batch_api_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow",
        Action = ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:ListBucket"],
        Resource = [
          "${aws_s3_bucket.raw_bucket.arn}",
          "${aws_s3_bucket.raw_bucket.arn}/*",
          "${aws_s3_bucket.results_bucket.arn}",
          "${aws_s3_bucket.results_bucket.arn}/*"
        ]
      },
      {
        Effect   = "Allow",
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"],
        Resource = aws_kms_key.main.arn
      }
    ]
  })
}

# ------------------------------------------------------------------------------
# Batch Processor Lambda (S3 Event Processor)
# ------------------------------------------------------------------------------
resource "aws_lambda_function" "batch_processor_lambda" {
  function_name = "aws-geocoding-batch-processor"
  role          = aws_iam_role.batch_processor_role.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.batch_processor_repo.repository_url}:latest"
  timeout       = 900  # 15 minutes max
  memory_size   = 2048 # 2GB for buffering

  environment {
    variables = {
      RESULTS_BUCKET_NAME     = aws_s3_bucket.results_bucket.bucket
      VALIDATOR_FUNCTION_NAME = aws_lambda_function.validator_lambda.function_name
    }
  }
}

resource "aws_iam_role" "batch_processor_role" {
  name = "aws-geocoding-batch-processor-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "batch_processor_policy" {
  name = "aws-geocoding-batch-processor-policy"
  role = aws_iam_role.batch_processor_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow",
        Action   = ["s3:GetObject"],
        Resource = "${aws_s3_bucket.raw_bucket.arn}/*"
      },
      {
        Effect   = "Allow",
        Action   = ["s3:PutObject"],
        Resource = "${aws_s3_bucket.results_bucket.arn}/*"
      },
      {
        Effect   = "Allow",
        Action   = ["lambda:InvokeFunction"],
        Resource = aws_lambda_function.validator_lambda.arn
      },
      {
        Effect   = "Allow",
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"],
        Resource = aws_kms_key.main.arn
      }
    ]
  })
}

# ------------------------------------------------------------------------------
# S3 Trigger
# ------------------------------------------------------------------------------
resource "aws_lambda_permission" "allow_bucket" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.batch_processor_lambda.arn
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.raw_bucket.arn
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.raw_bucket.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.batch_processor_lambda.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".csv"
    filter_prefix       = "uploads/"
  }

  depends_on = [aws_lambda_permission.allow_bucket]
}

# ------------------------------------------------------------------------------
# API Gateway Integration (API -> Batch API)
# ------------------------------------------------------------------------------
resource "aws_apigatewayv2_integration" "batch_api_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  connection_type        = "INTERNET"
  description            = "Proxy to Batch API Lambda"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.batch_api_lambda.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_jobs" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /jobs"
  target    = "integrations/${aws_apigatewayv2_integration.batch_api_integration.id}"
}

resource "aws_apigatewayv2_route" "get_jobs" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /jobs/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.batch_api_integration.id}"
}

resource "aws_lambda_permission" "batch_api_gw" {
  statement_id  = "AllowExecutionFromAPIGatewayBatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.batch_api_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
