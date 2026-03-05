resource "aws_ecs_cluster" "main" {
  name = "aws-geocoding-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "loader_logs" {
  name              = "/ecs/aws-geocoding-loader"
  retention_in_days = 7
}

# IAM Roles are defined in iam.tf:
# - aws_iam_role.ecs_execution_role
# - aws_iam_role.ecs_task_role

# Task Policy for S3, RDS, OpenSearch access
resource "aws_iam_policy" "ecs_task_policy" {
  name = "aws-geocoding-ecs-task-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.raw_bucket.arn,
          "${aws_s3_bucket.raw_bucket.arn}/*",
          aws_s3_bucket.ref_bucket.arn,
          "${aws_s3_bucket.ref_bucket.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "es:ESHttp*"
        ]
        Resource = "${aws_opensearch_domain.geocoding.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_rds_cluster.main.master_user_secret[0].secret_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.main.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_attach" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.ecs_task_policy.arn
}


resource "aws_ecs_task_definition" "loader" {
  family                   = "aws-geocoding-loader"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 2048
  memory                   = 4096
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "loader"
      image     = "${aws_ecr_repository.loader_repo.repository_url}:latest"
      essential = true

      entryPoint = ["python", "/var/task/index.py"]

      environment = [
        { name = "DB_HOST", value = aws_rds_cluster.main.endpoint },
        { name = "DB_NAME", value = aws_rds_cluster.main.database_name },
        { name = "OPENSEARCH_ENDPOINT", value = aws_opensearch_domain.geocoding.endpoint },
        { name = "DB_SECRET_ARN", value = aws_rds_cluster.main.master_user_secret[0].secret_arn }
      ]

      secrets = [
        {
          name      = "DB_PASS"
          valueFrom = "${aws_rds_cluster.main.master_user_secret[0].secret_arn}:password::"
        },
        {
          name      = "DB_USER"
          valueFrom = "${aws_rds_cluster.main.master_user_secret[0].secret_arn}:username::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.loader_logs.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}
