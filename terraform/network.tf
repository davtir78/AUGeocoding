resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "aws-geocoding-vpc"
  }
}

# Public Subnets
resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "ap-southeast-2a"
  map_public_ip_on_launch = true

  tags = {
    Name = "aws-geocoding-public-subnet-a"
  }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "ap-southeast-2b"
  map_public_ip_on_launch = true

  tags = {
    Name = "aws-geocoding-public-subnet-b"
  }
}

# Private Subnets
resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "ap-southeast-2a"

  tags = {
    Name = "aws-geocoding-private-subnet-a"
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "ap-southeast-2b"

  tags = {
    Name = "aws-geocoding-private-subnet-b"
  }
}

# Internet Gateway for Public Subnets
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "aws-geocoding-igw"
  }
}

# Route Table for Public Subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name = "aws-geocoding-public-rt"
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# Private Route Table (Currently no NAT, so isolated - as per Scale-to-Zero ISM architecture)
# If NAT was needed, we'd add a NAT Gateway in public subnet and route 0.0.0.0/0 to it here.
# For now, we rely on VPC Endpoints (to be added in security/endpoints) for AWS service access.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "aws-geocoding-private-rt"
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private.id
}

# --- VPC Endpoints for Scale-to-Zero Architecture (No NAT Gateway) ---
# ============================================================================
# Zero-VPC Cost Optimization Notes
# ============================================================================
# All VPC Interface Endpoints (Secrets Manager, Lambda, ECR, CloudWatch Logs)
# have been removed to eliminate costs (~$72/month).
#
# SECURITY NOTE:
# Connectivity to these services now happens over the public internet via the
# Lambda runtime's default internet access. This is secured by:
# 1. TLS Encryption (standard for all AWS public endpoints)
# 2. IAM Authentication (SigV4) - Only authorized roles can call these APIs.
#
# If strict network isolation is required (e.g., ISM compliance), you should:
# 1. Restore the VPC Interface Endpoints.
# 2. Put the Lambdas back into private subnets.
# ============================================================================

# Security Group for Interface Endpoints
resource "aws_security_group" "vpc_endpoints_sg" {
  count       = var.use_vpc ? 1 : 0
  name        = "aws-geocoding-vpc-endpoints-sg"
  description = "Security group for VPC Endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id, aws_security_group.ecs_sg.id]
  }

  tags = {
    Name = "aws-geocoding-vpc-endpoints-sg"
  }
}

locals {
  target_subnets = var.use_vpc ? (var.multi_az ? [aws_subnet.private_a.id, aws_subnet.private_b.id] : [aws_subnet.private_a.id]) : []
}

# S3 Gateway Endpoint
resource "aws_vpc_endpoint" "s3" {
  count             = var.use_vpc ? 1 : 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
}

# DynamoDB Gateway Endpoint (For pipeline progress tracking)
resource "aws_vpc_endpoint" "dynamodb" {
  count             = var.use_vpc ? 1 : 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
}

# Secrets Manager, Logs, ECR Interface Endpoints
resource "aws_vpc_endpoint" "secretsmanager" {
  count               = var.use_vpc ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.target_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints_sg[0].id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "logs" {
  count               = var.use_vpc ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.target_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints_sg[0].id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "ecr_api" {
  count               = var.use_vpc ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.target_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints_sg[0].id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  count               = var.use_vpc ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.target_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints_sg[0].id]
  private_dns_enabled = true
}

