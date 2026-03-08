# ECR Repository for Validator Lambda
resource "aws_ecr_repository" "validator_repo" {
  name                 = "aws-geocoding-validator"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Validator Lambda Function
resource "aws_lambda_function" "validator_lambda" {
  function_name = "aws-geocoding-validator"
  role          = aws_iam_role.validator_role.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.validator_repo.repository_url}:latest"
  timeout       = 30   # OpenSearch queries should be <1s
  memory_size   = 1024 # Reduced: libpostal removed, OpenSearch queries are lightweight

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
      DB_HOST             = aws_rds_cluster.main.endpoint
      OPENSEARCH_ENDPOINT = trimprefix(aws_opensearch_domain.geocoding.endpoint, "https://")
      USE_DATA_API        = var.use_vpc ? "false" : "true"
    }
  }
}

# IAM Role for Validator
resource "aws_iam_role" "validator_role" {
  name = "aws-geocoding-validator-role"

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

# Policies (Logs, VPC, Secrets)
resource "aws_iam_policy" "validator_policy" {
  name = "aws-geocoding-validator-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      },
      # RDS Data API Access (Zero-VPC)
      {
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement"
        ]
        Effect   = "Allow"
        Resource = aws_rds_cluster.main.arn
      },
      {
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:GetAuthorizationToken"
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Effect   = "Allow"
        Resource = aws_rds_cluster.main.master_user_secret[0].secret_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "validator_attach" {
  role       = aws_iam_role.validator_role.name
  policy_arn = aws_iam_policy.validator_policy.arn
}

resource "aws_iam_role_policy_attachment" "validator_vpc_attach" {
  role       = aws_iam_role.validator_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}
