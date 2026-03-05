# Lambda Execution Role
resource "aws_iam_role" "lambda_exec_role" {
  name = "aws-geocoding-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# Policy for Logging, VPC Access, S3, KMS, and Secrets Manager (for DB creds)
resource "aws_iam_policy" "lambda_policy" {
  name        = "aws-geocoding-lambda-policy"
  description = "Permissions for Geocoding Lambdas"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      # CloudWatch Logs
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Effect   = "Allow",
        Resource = "arn:aws:logs:*:*:*"
      },
      # VPC Access
      {
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ],
        Effect   = "Allow",
        Resource = "*"
      },
      # S3 Access
      {
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ],
        Effect = "Allow",
        Resource = [
          aws_s3_bucket.raw_bucket.arn, "${aws_s3_bucket.raw_bucket.arn}/*",
          aws_s3_bucket.ref_bucket.arn, "${aws_s3_bucket.ref_bucket.arn}/*",
          aws_s3_bucket.results_bucket.arn, "${aws_s3_bucket.results_bucket.arn}/*"
        ]
      },
      # KMS Access
      {
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ],
        Effect   = "Allow",
        Resource = aws_kms_key.main.arn
      },
      # Secrets Manager Access (Only for the DB Secret)
      {
        Action = [
          "secretsmanager:GetSecretValue"
        ],
        Effect   = "Allow",
        Resource = aws_rds_cluster.main.master_user_secret[0].secret_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_attach" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}

# ECS Task Execution Role (Pulling images, logging)
resource "aws_iam_role" "ecs_execution_role" {
  name = "aws-geocoding-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_attach" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Execution Role needs access to Secrets Manager to inject DB creds
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "aws-geocoding-ecs-execution-secrets"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "secretsmanager:GetSecretValue",
          "kms:Decrypt"
        ]
        Effect = "Allow"
        Resource = [
          aws_rds_cluster.main.master_user_secret[0].secret_arn,
          aws_kms_key.main.arn
        ]
      }
    ]
  })
}

# ECS Task Role (Permissions for the app itself, e.g. S3 access if needed)
resource "aws_iam_role" "ecs_task_role" {
  name = "aws-geocoding-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

# Task Role policy attachment is handled in ecs.tf
