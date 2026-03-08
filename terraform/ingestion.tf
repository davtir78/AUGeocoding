# ECR Repository for Loader Lambda
resource "aws_ecr_repository" "loader_repo" {
  name                 = "aws-geocoding-loader"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Loader Lambda Function
# Note: Initial deployment requires a dummy image or the image to be pushed first.
# We will assume the user runs the build script before applying this resource fully,
# OR we use a variable for image_uri which defaults to a dummy if needed.
resource "aws_lambda_function" "loader_lambda" {
  function_name = "aws-geocoding-loader"
  role          = aws_iam_role.lambda_exec_role.arn
  package_type  = "Image"
  # Placeholder: User must push image to ECR Repo URI before this specific resource works perfectly
  # For the first run, we might get an error if image doesn't exist.
  # We can mitigate this by having a separate "bootstrap" for ECR, but for this POC we'll document the order.
  image_uri   = "${aws_ecr_repository.loader_repo.repository_url}:latest"
  timeout     = 900 # 15 minutes
  memory_size = 1024

  dynamic "vpc_config" {
    for_each = var.use_vpc ? [1] : []
    content {
      subnet_ids         = var.multi_az ? [aws_subnet.private_a.id, aws_subnet.private_b.id] : [aws_subnet.private_a.id]
      security_group_ids = [aws_security_group.lambda_sg.id]
    }
  }

  environment {
    variables = {
      DB_SECRET_ARN       = aws_rds_cluster.main.master_user_secret[0].secret_arn
      DB_CLUSTER_ARN      = aws_rds_cluster.main.arn
      DB_NAME             = aws_rds_cluster.main.database_name
      DB_HOST             = aws_rds_cluster.main.endpoint # Reader/Writer endpoint
      OPENSEARCH_ENDPOINT = aws_opensearch_domain.geocoding.endpoint
      USE_DATA_API        = var.use_vpc ? "false" : "true"
    }
  }
}

# Downloader Lambda (same image, but NO VPC for internet access)
resource "aws_lambda_function" "downloader_lambda" {
  function_name = "aws-geocoding-downloader"
  role          = aws_iam_role.lambda_exec_role.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.loader_repo.repository_url}:latest"
  timeout       = 900 # 15 minutes
  memory_size   = 1024

  # No VPC Config -> Direct Internet Access (for data.gov.au)

  environment {
    variables = {
      # No DB access needed
    }
  }
}

# Step Functions Role
resource "aws_iam_role" "sfn_role" {
  name = "aws-geocoding-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "states.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_policy" "sfn_policy" {
  name = "aws-geocoding-sfn-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "lambda:InvokeFunction"
        Effect = "Allow"
        Resource = [
          aws_lambda_function.loader_lambda.arn,
          aws_lambda_function.downloader_lambda.arn
        ]
      },
      {
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Effect = "Allow"
        Resource = [
          aws_s3_bucket.ref_bucket.arn,
          "${aws_s3_bucket.ref_bucket.arn}/*"
        ]
      },
      {
        Action = [
          "states:StartMapRun",
          "states:ListMapRuns",
          "states:DescribeMapRun",
          "states:StopMapRun",
          "states:StartExecution"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "sfn_attach" {
  role       = aws_iam_role.sfn_role.name
  policy_arn = aws_iam_policy.sfn_policy.arn
}


# Step Functions State Machine
resource "aws_sfn_state_machine" "ingestion_machine" {
  name     = "aws-geocoding-ingestion"
  role_arn = aws_iam_role.sfn_role.arn

  definition = jsonencode({
    Comment = "Distributed Map for loading G-NAF files"
    StartAt = "MapGnafs"
    States = {
      MapGnafs = {
        Type = "Map"
        ItemReader = {
          Resource = "arn:aws:states:::s3:listObjectsV2"
          Parameters = {
            Bucket = aws_s3_bucket.ref_bucket.bucket
            Prefix = "gnaf/"
          }
        }
        ItemProcessor = {
          ProcessorConfig = {
            Mode          = "DISTRIBUTED"
            ExecutionType = "STANDARD"
          }
          StartAt = "LoadFile"
          States = {
            LoadFile = {
              Type       = "Task"
              Resource   = "arn:aws:states:::lambda:invoke"
              OutputPath = "$.Payload"
              Parameters = {
                "FunctionName" = aws_lambda_function.loader_lambda.arn
                "Payload" = {
                  "s3_key.$"   = "$.Key"
                  "s3_bucket"  = aws_s3_bucket.ref_bucket.bucket
                  "table_name" = "gnaf"
                }
              }
              Retry = [{
                ErrorEquals     = ["States.TaskFailed", "Lambda.TooManyRequestsException"]
                IntervalSeconds = 2
                MaxAttempts     = 3
                BackoffRate     = 2.0
              }]
              End = true
            }
          }
        }
        Next = "CreateIndexes"
      }
      CreateIndexes = {
        Type       = "Task"
        Resource   = "arn:aws:states:::lambda:invoke"
        OutputPath = "$.Payload"
        Parameters = {
          "FunctionName" = aws_lambda_function.loader_lambda.arn
          "Payload" = {
            "mode"      = "SQL"
            "sql"       = "SELECT cron.schedule('now', 'CREATE INDEX IF NOT EXISTS idx_gnaf_address_trgm ON gnaf USING gin (address_string gin_trgm_ops); CREATE INDEX IF NOT EXISTS idx_gnaf_state ON gnaf(state); CREATE INDEX IF NOT EXISTS idx_gnaf_postcode ON gnaf(postcode); CREATE INDEX IF NOT EXISTS idx_gnaf_geom ON gnaf USING gist (geom);');"
            "task_name" = "Schedule Indexes"
          }
        }
        Retry = [{
          ErrorEquals     = ["States.TaskFailed", "Lambda.TooManyRequestsException"]
          IntervalSeconds = 2
          MaxAttempts     = 3
          BackoffRate     = 2.0
        }]
        Next = "Vacuum"
      }
      Vacuum = {
        Type       = "Task"
        Resource   = "arn:aws:states:::lambda:invoke"
        OutputPath = "$.Payload"
        Parameters = {
          "FunctionName" = aws_lambda_function.loader_lambda.arn
          "Payload" = {
            "mode"      = "SQL"
            "sql"       = "SELECT cron.schedule('now', 'VACUUM ANALYZE gnaf;');"
            "task_name" = "Schedule Vacuum"
          }
        }
        End = true
      }
    }
  })
}
