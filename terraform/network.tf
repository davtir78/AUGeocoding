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

# Security Group for Interface Endpoints (Secrets Manager)
resource "aws_security_group" "endpoints_sg" {
  name        = "aws-geocoding-endpoints-sg"
  description = "Allow HTTPS from Lambda"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }
}

# S3 Gateway Endpoint (Free, High Throughput)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-southeast-2.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = [aws_route_table.private.id]

  tags = {
    Name = "aws-geocoding-s3-endpoint"
  }
}

# Secrets Manager Interface Endpoint (Enables key retrieval without NAT)
resource "aws_vpc_endpoint" "secrets" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-southeast-2.secretsmanager"
  vpc_endpoint_type = "Interface"

  subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids = [aws_security_group.endpoints_sg.id]

  private_dns_enabled = true

  tags = {
    Name = "aws-geocoding-secrets-endpoint"
  }
}

# Lambda Interface Endpoint (Enables self-invocation without NAT)
resource "aws_vpc_endpoint" "lambda" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-southeast-2.lambda"
  vpc_endpoint_type = "Interface"

  subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids = [aws_security_group.endpoints_sg.id]

  private_dns_enabled = true

  tags = {
    Name = "aws-geocoding-lambda-endpoint"
  }
}

# ECR API Endpoint (for pulling images)
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-southeast-2.ecr.api"
  vpc_endpoint_type = "Interface"

  subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids = [aws_security_group.endpoints_sg.id]

  private_dns_enabled = true

  tags = {
    Name = "aws-geocoding-ecr-api-endpoint"
  }
}

# ECR DKR Endpoint (for pulling layers)
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-southeast-2.ecr.dkr"
  vpc_endpoint_type = "Interface"

  subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids = [aws_security_group.endpoints_sg.id]

  private_dns_enabled = true

  tags = {
    Name = "aws-geocoding-ecr-dkr-endpoint"
  }
}

# CloudWatch Logs Endpoint (for shipping logs)
resource "aws_vpc_endpoint" "logs" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-southeast-2.logs"
  vpc_endpoint_type = "Interface"

  subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids = [aws_security_group.endpoints_sg.id]

  private_dns_enabled = true

  tags = {
    Name = "aws-geocoding-logs-endpoint"
  }
}
