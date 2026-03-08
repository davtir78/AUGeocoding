# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "aws-geocoding-db-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = {
    Name = "aws-geocoding-db-subnet-group"
  }
}

# Aurora Cluster (Serverless v2)
resource "aws_rds_cluster" "main" {
  cluster_identifier          = "aws-geocoding-aurora-cluster"
  engine                      = "aurora-postgresql"
  engine_mode                 = "provisioned"
  engine_version              = "16.6"
  database_name               = "geocoder"
  master_username             = "postgres"
  manage_master_user_password = true # Managed by Secrets Manager
  enable_http_endpoint        = true # Enable Data API

  storage_encrypted = true
  kms_key_id        = aws_kms_key.main.arn

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]

  skip_final_snapshot = true # For POC only

  serverlessv2_scaling_configuration {
    min_capacity = 0.0 # Support scale-to-zero if available
    max_capacity = 4.0
  }

  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name

  tags = {
    Name = "aws-geocoding-aurora"
  }
}

resource "aws_rds_cluster_parameter_group" "main" {
  name        = "aws-geocoding-cluster-pg"
  family      = "aurora-postgresql16"
  description = "Cluster parameter group with pg_cron"

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_cron"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "cron.database_name"
    value        = "geocoder"
    apply_method = "pending-reboot"
  }
}

# Aurora Instance (Required for v2 to function)
resource "aws_rds_cluster_instance" "main" {
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}

output "db_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "db_port" {
  value = aws_rds_cluster.main.port
}

output "db_cluster_arn" {
  value = aws_rds_cluster.main.arn
}

output "db_secret_arn" {
  value = aws_rds_cluster.main.master_user_secret[0].secret_arn
}
