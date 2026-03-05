data "aws_caller_identity" "current" {}

# KMS Key for Encryption (Database, S3, etc.)
resource "aws_kms_key" "main" {
  description             = "KMS key for AWS Address Validation POC"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow CloudFront to Decrypt"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
        Condition = {
          StringLike = {
            "aws:SourceArn" : "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/*"
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "main" {
  name          = "alias/address-val-key"
  target_key_id = aws_kms_key.main.key_id
}

# Security Groups

# Lambda Security Group
resource "aws_security_group" "lambda_sg" {
  name        = "aws-geocoding-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aws-geocoding-lambda-sg"
  }
}

# Database Security Group
resource "aws_security_group" "db_sg" {
  name        = "aws-geocoding-db-sg"
  description = "Security group for Aurora Database"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
    description     = "Allow logical access from Lambda"
  }

  tags = {
    Name = "aws-geocoding-db-sg"
  }
}

# ECS Security Group
resource "aws_security_group" "ecs_sg" {
  name        = "aws-geocoding-ecs-sg"
  description = "Security group for ECS Fargate"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 4400
    to_port         = 4400
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
    description     = "Allow access from Lambda"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aws-geocoding-ecs-sg"
  }
}
