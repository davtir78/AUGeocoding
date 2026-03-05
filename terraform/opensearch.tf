# ============================================================================
# OpenSearch Domain for Geocoding POC
# Cost-optimized: t3.small.search (~$0.036/hr when running)
# Can be stopped at night via AWS Console or Lambda scheduler
# ============================================================================

# Security Group for OpenSearch
resource "aws_security_group" "opensearch_sg" {
  name        = "aws-geocoding-opensearch-sg"
  description = "Allow access to OpenSearch from Lambda"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTPS from Lambda"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aws-geocoding-opensearch-sg"
  }
}

# IAM Service-Linked Role for OpenSearch (created automatically by AWS)
# No need to define, but ensure it exists

# OpenSearch Domain
resource "aws_opensearch_domain" "geocoding" {
  domain_name    = "geocoding-poc"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type  = "t3.small.search" # Smallest instance, ~$0.036/hr
    instance_count = 1                 # Single node for POC

    # No dedicated master for POC (cost saving)
    dedicated_master_enabled = false

    # No zone awareness for POC (cost saving)
    zone_awareness_enabled = false
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 20 # GB - sufficient for 16M address records
    iops        = 3000
    throughput  = 125
  }

  vpc_options {
    subnet_ids         = [aws_subnet.private_a.id]
    security_group_ids = [aws_security_group.opensearch_sg.id]
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  # Access policy - allow Lambda role
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = [
            aws_iam_role.validator_role.arn,
            aws_iam_role.lambda_exec_role.arn
          ]
        }
        Action   = "es:*"
        Resource = "arn:aws:es:ap-southeast-2:${data.aws_caller_identity.current.account_id}:domain/geocoding-poc/*"
      }
    ]
  })

  tags = {
    Name        = "aws-geocoding-opensearch"
    Environment = "poc"
    CostCenter  = "geocoding"
  }
}

# Data sources already defined in security.tf
# data "aws_region" "current" {}
# data "aws_caller_identity" "current" {}

# Output the OpenSearch endpoint
output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint"
  value       = aws_opensearch_domain.geocoding.endpoint
}

output "opensearch_dashboard_endpoint" {
  description = "OpenSearch Dashboards endpoint"
  value       = aws_opensearch_domain.geocoding.dashboard_endpoint
}
