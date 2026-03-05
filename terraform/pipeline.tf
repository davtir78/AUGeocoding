resource "aws_dynamodb_table" "dataset_state" {
  name         = "aws-geocoding-dataset-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "DatasetName"

  attribute {
    name = "DatasetName"
    type = "S"
  }

  tags = {
    Name = "aws-geocoding-dataset-state"
  }
}

resource "aws_dynamodb_table" "pipeline_progress" {
  name         = "aws-geocoding-pipeline-progress"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ExecutionId"
  range_key    = "StepName"

  attribute {
    name = "ExecutionId"
    type = "S"
  }

  attribute {
    name = "StepName"
    type = "S"
  }

  tags = {
    Name = "aws-geocoding-pipeline-progress"
  }
}

# IAM Role for Step Functions
# IAM Role for Orchestrator Step Function
resource "aws_iam_role" "orchestrator_role" {
  name = "aws-geocoding-orchestrator-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "orchestrator_policy" {
  name = "aws-geocoding-orchestrator-policy"
  role = aws_iam_role.orchestrator_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction",
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups",
          "ecs:RunTask"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          aws_iam_role.ecs_execution_role.arn,
          aws_iam_role.ecs_task_role.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "events:PutTargets",
          "events:PutRule",
          "events:DescribeRule"
        ]
        Resource = "*"
      }
    ]
  })
}

# CheckVersion Lambda Packaging
data "archive_file" "check_version_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/lambdas/check_version"
  output_path = "${path.module}/.terraform/check_version.zip"
}

# CheckVersion Lambda Role
resource "aws_iam_role" "check_version_role" {
  name = "aws-geocoding-check-version-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "check_version_policy" {
  name = "aws-geocoding-check-version-policy"
  role = aws_iam_role.check_version_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*" # Restrict to specific DynamoDB table in production
      }
    ]
  })
}

# CheckVersion Lambda Function
resource "aws_lambda_function" "check_version" {
  filename         = data.archive_file.check_version_zip.output_path
  function_name    = "aws-geocoding-check-version"
  role             = aws_iam_role.check_version_role.arn
  handler          = "index.lambda_handler"
  source_code_hash = data.archive_file.check_version_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      DATASET_STATE_TABLE = aws_dynamodb_table.dataset_state.name
    }
  }
}

# Progress Manager Lambda Packaging
data "archive_file" "progress_manager_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/lambdas/update_progress"
  output_path = "${path.module}/.terraform/progress_manager.zip"
}

# Progress Manager Lambda Role
resource "aws_iam_role" "progress_manager_role" {
  name = "aws-geocoding-progress-manager-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "progress_manager_policy" {
  name = "aws-geocoding-progress-manager-policy"
  role = aws_iam_role.progress_manager_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:DescribeTable",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "states:StartExecution",
          "states:StopExecution",
          "states:ListExecutions",
          "scheduler:UpdateSchedule",
          "scheduler:GetSchedule",
          "scheduler:ListSchedules"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = aws_iam_role.scheduler_role.arn
      }
    ]
  })
}

# Progress Manager Lambda Function
resource "aws_lambda_function" "progress_manager" {
  filename         = data.archive_file.progress_manager_zip.output_path
  function_name    = "aws-geocoding-progress-manager"
  role             = aws_iam_role.progress_manager_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.progress_manager_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      PROGRESS_TABLE     = aws_dynamodb_table.pipeline_progress.name
      INGESTION_SFN_ARN  = "arn:aws:states:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:stateMachine:aws-geocoding-orchestrator"
      SCHEDULER_NAME     = "aws-geocoding-weekly-check"
      SCHEDULER_ROLE_ARN = aws_iam_role.scheduler_role.arn
    }
  }
}

# Step Function Definition
# Coordination of the Three-Stage Pipeline
resource "aws_sfn_state_machine" "orchestrator" {
  name     = "aws-geocoding-orchestrator"
  role_arn = aws_iam_role.orchestrator_role.arn

  definition = jsonencode({
    Comment = "Orchestrates the Geocoding Data Refresh Pipeline",
    StartAt = "InitProgress",
    States = {
      InitProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "input.$" : "$",
            "step_name" : "PipelineStart",
            "status" : "IN_PROGRESS",
            "message" : "Pipeline initiated"
          }
        },
        ResultPath = "$.pipeline_config",
        Next       = "StartVersionCheckProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleVersionCheckError", ResultPath = "$.error_info" }]
      },

      # STAGE 0: DATA ACQUISITION
      StartVersionCheckProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "VersionCheck",
            "status" : "IN_PROGRESS",
            "message" : "Checking for G-NAF updates"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "CheckVersion",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "PipelineFailed", ResultPath = "$.error_info" }]
      },
      CheckVersion = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" = aws_lambda_function.check_version.arn,
          "Payload.$"    = "$"
        },
        ResultSelector = {
          "update_available.$" : "$.Payload.update_available",
          "latest_version.$" : "$.Payload.latest_version",
          "download_url.$" : "$.Payload.download_url"
        },
        ResultPath = "$.version_info",
        Next       = "EndVersionCheckProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "PipelineFailed", ResultPath = "$.error_info" }]
      },
      EndVersionCheckProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "VersionCheck",
            "status" : "COMPLETED",
            "message" : "Version check complete"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "CheckUpdateRequired",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "PipelineFailed", ResultPath = "$.error_info" }]
      },
      CheckUpdateRequired = {
        Type = "Choice",
        Choices = [
          {
            Variable      = "$.version_info.update_available",
            BooleanEquals = true,
            Next          = "StartDownloadProgress"
          }
        ],
        Default = "NoUpdateNeeded"
      },

      # STAGE 0: DATA ACQUISITION (Download)
      StartDownloadProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "DownloadGnaf",
            "status" : "IN_PROGRESS",
            "message" : "Starting G-NAF Download"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "DownloadGnaf",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleDownloadError", ResultPath = "$.error_info" }]
      },
      DownloadGnaf = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.downloader_lambda.arn}",
          "Payload" : {
            "mode" : "DOWNLOAD_FILE",
            "url.$" : "$.version_info.download_url",
            "s3_bucket" : "${aws_s3_bucket.raw_bucket.id}",
            "s3_key" : "raw/gnaf/national.zip"
          }
        },
        ResultPath = "$.download_result",
        Next       = "EndDownloadProgress",
        Retry = [{
          ErrorEquals     = ["States.ALL"],
          IntervalSeconds = 30,
          MaxAttempts     = 3,
          BackoffRate     = 2.0
        }],
        Catch = [{ ErrorEquals = ["States.ALL"], Next = "HandleDownloadError", ResultPath = "$.error_info" }]
      },
      EndDownloadProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "DownloadGnaf",
            "status" : "COMPLETED",
            "message" : "G-NAF Downloaded successfully"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartRefreshReferenceProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleDownloadError", ResultPath = "$.error_info" }]
      },

      # STAGE 0c: REFRESH ACTIVE REFERENCE DATA (MMM mid-cycle reassessments)
      StartRefreshReferenceProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "RefreshReferenceData",
            "status" : "IN_PROGRESS",
            "message" : "Refreshing active MMM reference data"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "RefreshReferenceData",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleTransformError", ResultPath = "$.error_info" }]
      },
      RefreshReferenceData = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.loader_lambda.arn}",
          "Payload" : {
            "mode" : "REFRESH_REFERENCE_DATA",
            "mmm_year" : 2023
          }
        },
        ResultPath = "$.reference_result",
        Next       = "EndRefreshReferenceProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleTransformError", ResultPath = "$.error_info" }]
      },
      EndRefreshReferenceProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "RefreshReferenceData",
            "status" : "COMPLETED",
            "message" : "Reference data refreshed"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartTransformProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleTransformError", ResultPath = "$.error_info" }]
      },


      # STAGE 1: TRANSFORMATION (ECS)
      StartTransformProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Transform",
            "status" : "IN_PROGRESS",
            "message" : "Starting G-NAF Transformation"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "TransformGnaf",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleTransformError", ResultPath = "$.error_info" }]
      },
      TransformGnaf = {
        Type     = "Task",
        Resource = "arn:aws:states:::ecs:runTask.sync",
        Parameters = {
          "LaunchType" : "FARGATE",
          "Cluster" : aws_ecs_cluster.main.arn,
          "TaskDefinition.$" : "$.pipeline_config.Payload.resolved_task_definition_arn",
          "NetworkConfiguration" : {
            "AwsvpcConfiguration" : {
              "Subnets" : [aws_subnet.private_a.id, aws_subnet.private_b.id],
              "SecurityGroups" : [aws_security_group.lambda_sg.id],
              "AssignPublicIp" : "DISABLED"
            }
          },
          "Overrides" : {
            "ContainerOverrides" : [
              {
                "Name" : "loader",
                "Command" : ["--mode", "TRANSFORM_GNAF", "--s3_bucket", "${aws_s3_bucket.raw_bucket.id}", "--s3_key", "raw/gnaf/national.zip", "--output_key", "raw/gnaf/transformed.psv"],
                "Environment" : [
                  { "Name" : "TEST_MODE", "Value.$" : "$.pipeline_config.Payload.test_mode" },
                  { "Name" : "LIMIT_PERCENT", "Value.$" : "$.pipeline_config.Payload.limit_percent" }
                ]
              }
            ]
          }
        },
        ResultPath = "$.transform_result",
        Next       = "EndTransformProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleTransformError", ResultPath = "$.error_info" }]
      },
      EndTransformProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Transform",
            "status" : "COMPLETED",
            "message" : "G-NAF Transformation complete"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartIngestionProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleTransformError", ResultPath = "$.error_info" }]
      },

      # STAGE 2: INGESTION (ECS FARGATE)
      StartIngestionProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Ingestion",
            "status" : "IN_PROGRESS",
            "message" : "Starting RDS Ingestion (Fargate)"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartNationalIngestion",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIngestionError", ResultPath = "$.error_info" }]
      },
      StartNationalIngestion = {
        Type     = "Task",
        Resource = "arn:aws:states:::ecs:runTask.sync",
        Parameters = {
          "LaunchType" : "FARGATE",
          "Cluster" : aws_ecs_cluster.main.arn,
          "TaskDefinition.$" : "$.pipeline_config.Payload.resolved_task_definition_arn",
          "NetworkConfiguration" : {
            "AwsvpcConfiguration" : {
              "Subnets" : [aws_subnet.private_a.id, aws_subnet.private_b.id],
              "SecurityGroups" : [aws_security_group.lambda_sg.id],
              "AssignPublicIp" : "DISABLED"
            }
          },
          "Overrides" : {
            "ContainerOverrides" : [
              {
                "Name" : "loader",
                "Command" : ["--mode", "S3_INGESTION", "--s3_bucket", "${aws_s3_bucket.raw_bucket.id}", "--s3_key", "raw/gnaf/transformed.psv", "--table_name", "gnaf", "--truncate"],
                "Environment" : [
                  { "Name" : "TEST_MODE", "Value.$" : "$.pipeline_config.Payload.test_mode" },
                  { "Name" : "LIMIT_PERCENT", "Value.$" : "$.pipeline_config.Payload.limit_percent" }
                ]
              }
            ]
          }
        },
        ResultPath = "$.ingestion_result",
        Next       = "EndIngestionProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIngestionError", ResultPath = "$.error_info" }]
      },
      EndIngestionProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Ingestion",
            "status" : "COMPLETED",
            "message" : "RDS Ingestion complete"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartSyntheticProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIngestionError", ResultPath = "$.error_info" }]
      },

      # STAGE 1.5: SYNTHETIC PARENT INJECTION
      StartSyntheticProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "SyntheticInjection",
            "status" : "IN_PROGRESS",
            "message" : "Injecting synthetic building parents"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "InjectSyntheticParents",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleSyntheticError", ResultPath = "$.error_info" }]
      },
      InjectSyntheticParents = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.loader_lambda.arn}",
          "Payload" : {
            "mode" : "INJECT_SYNTHETIC_PARENTS",
            "version.$" : "$.version_info.latest_version"
          }
        },
        ResultPath = "$.synthetic_result",
        Next       = "EndSyntheticProgress",
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"],
          IntervalSeconds = 30,
          MaxAttempts     = 2,
          BackoffRate     = 2.0
        }],
        Catch = [{ ErrorEquals = ["States.ALL"], Next = "HandleSyntheticError", ResultPath = "$.error_info" }]
      },
      EndSyntheticProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "SyntheticInjection",
            "status" : "COMPLETED",
            "message" : "Synthetic injection complete"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartEnrichmentProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleSyntheticError", ResultPath = "$.error_info" }]
      },

      # STAGE 2: SPATIAL PRE-ENRICHMENT
      StartEnrichmentProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "PreEnrichment",
            "status" : "IN_PROGRESS",
            "message" : "Enriching G-NAF with spatial attributes"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "PreEnrichSpatial",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleEnrichmentError", ResultPath = "$.error_info" }]
      },
      PreEnrichSpatial = {
        Type     = "Task",
        Resource = "arn:aws:states:::ecs:runTask.sync",
        Parameters = {
          "LaunchType" : "FARGATE",
          "Cluster" : aws_ecs_cluster.main.arn,
          "TaskDefinition.$" : "$.pipeline_config.Payload.resolved_task_definition_arn",
          "NetworkConfiguration" : {
            "AwsvpcConfiguration" : {
              "Subnets" : [aws_subnet.private_a.id, aws_subnet.private_b.id],
              "SecurityGroups" : [aws_security_group.lambda_sg.id],
              "AssignPublicIp" : "DISABLED"
            }
          },
          "Overrides" : {
            "ContainerOverrides" : [
              {
                "Name" : "loader",
                "Command" : ["--mode", "PRE_ENRICH_SPATIAL"],
                "Environment" : [
                  { "Name" : "TEST_MODE", "Value.$" : "$.pipeline_config.Payload.test_mode" },
                  { "Name" : "LIMIT_PERCENT", "Value.$" : "$.pipeline_config.Payload.limit_percent" }
                ]
              }
            ]
          }
        },
        ResultPath = "$.enrichment_result",
        Next       = "EndEnrichmentProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleEnrichmentError", ResultPath = "$.error_info" }]
      },
      EndEnrichmentProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "PreEnrichment",
            "status" : "COMPLETED",
            "message" : "Spatial pre-enrichment complete"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartMatViewRefreshProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleEnrichmentError", ResultPath = "$.error_info" }]
      },

      # STAGE 2.5: REFRESH MATERIALIZED VIEW (gnaf_export_view)
      StartMatViewRefreshProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "RefreshMatView",
            "status" : "IN_PROGRESS",
            "message" : "Refreshing gnaf_export_view materialized view"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "RefreshMatView",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleEnrichmentError", ResultPath = "$.error_info" }]
      },
      RefreshMatView = {
        Type     = "Task",
        Resource = "arn:aws:states:::ecs:runTask.sync",
        Parameters = {
          "LaunchType" : "FARGATE",
          "Cluster" : aws_ecs_cluster.main.arn,
          "TaskDefinition.$" : "$.pipeline_config.Payload.resolved_task_definition_arn",
          "NetworkConfiguration" : {
            "AwsvpcConfiguration" : {
              "Subnets" : [aws_subnet.private_a.id, aws_subnet.private_b.id],
              "SecurityGroups" : [aws_security_group.lambda_sg.id],
              "AssignPublicIp" : "DISABLED"
            }
          },
          "Overrides" : {
            "ContainerOverrides" : [
              {
                "Name" : "loader",
                "Command" : ["--mode", "REFRESH_MATVIEW"],
                "Environment" : [
                  { "Name" : "TEST_MODE", "Value.$" : "$.pipeline_config.Payload.test_mode" },
                  { "Name" : "LIMIT_PERCENT", "Value.$" : "$.pipeline_config.Payload.limit_percent" }
                ]
              }
            ]
          }
        },
        ResultPath = "$.matview_result",
        Next       = "EndMatViewRefreshProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleEnrichmentError", ResultPath = "$.error_info" }]
      },
      EndMatViewRefreshProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "RefreshMatView",
            "status" : "COMPLETED",
            "message" : "gnaf_export_view refreshed successfully"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "StartIndexingProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleEnrichmentError", ResultPath = "$.error_info" }]
      },


      # STAGE 3: INDEXING (OPENSEARCH)
      StartIndexingProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Indexing",
            "status" : "IN_PROGRESS",
            "message" : "Starting OpenSearch Indexing"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "CreateOpenSearchIndex",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIndexingError", ResultPath = "$.error_info" }]
      },
      CreateOpenSearchIndex = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.loader_lambda.arn}",
          "Payload" : {
            "mode" : "INDEX_OPENSEARCH",
            "create_index" : true,
            "index_name.$" : "$.version_info.latest_version"
          }
        },
        ResultPath = "$.index_create_result",
        Next       = "StartBulkIndexing",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIndexingError", ResultPath = "$.error_info" }]
      },

      StartBulkIndexing = {
        Type     = "Task",
        Resource = "arn:aws:states:::ecs:runTask.sync",
        Parameters = {
          "LaunchType" : "FARGATE",
          "Cluster" : "${aws_ecs_cluster.main.arn}",
          "TaskDefinition.$" : "$.pipeline_config.Payload.resolved_task_definition_arn",
          "NetworkConfiguration" : {
            "AwsvpcConfiguration" : {
              "Subnets" : ["${aws_subnet.private_a.id}", "${aws_subnet.private_b.id}"],
              "SecurityGroups" : ["${aws_security_group.lambda_sg.id}"],
              "AssignPublicIp" : "DISABLED"
            }
          },
          "Overrides" : {
            "ContainerOverrides" : [
              {
                "Name" : "loader",
                "Command" : [
                  "--mode", "INDEX_OPENSEARCH",
                  "--limit", "10000",
                  "--iterate"
                ],
                "Environment" : [
                  { "Name" : "TEST_MODE", "Value.$" : "$.pipeline_config.Payload.test_mode" },
                  { "Name" : "LIMIT_PERCENT", "Value.$" : "$.pipeline_config.Payload.limit_percent" },
                  { "Name" : "INDEX_NAME", "Value.$" : "$.version_info.latest_version" }
                ]
              }
            ]
          }
        },
        ResultPath = "$.indexing_result",
        Next       = "UpdateAlias",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIndexingError", ResultPath = "$.error_info" }]
      },

      UpdateAlias = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.loader_lambda.arn}",
          "Payload" : {
            "mode" : "UPDATE_ALIAS",
            "alias_name" : "gnaf",
            "index_name.$" : "$.version_info.latest_version"
          }
        },
        ResultPath = "$.alias_result",
        Next       = "EndIndexingProgress",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIndexingError", ResultPath = "$.error_info" }]
      },
      EndIndexingProgress = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Indexing",
            "status" : "COMPLETED",
            "message" : "OpenSearch Indexing complete"
          }
        },
        ResultPath = "$.progress_result",
        Next       = "PipelineComplete",
        Catch      = [{ ErrorEquals = ["States.ALL"], Next = "HandleIndexingError", ResultPath = "$.error_info" }]
      },

      PipelineComplete = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "PipelineStart",
            "status" : "COMPLETED",
            "message" : "G-NAF Refresh successful"
          }
        },
        End   = true,
        Catch = [{ ErrorEquals = ["States.ALL"], Next = "PipelineFailed", ResultPath = "$.error_info" }]
      },
      NoUpdateNeeded = {
        Type = "Pass",
        Result = {
          "status" : "Skipped - Already on latest version"
        },
        End = true
      },
      HandleVersionCheckError = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "VersionCheck",
            "status" : "ERROR",
            "message" : "Version check failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "PipelineFailed"
      },
      HandleDownloadError = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "DownloadGnaf",
            "status" : "ERROR",
            "message" : "G-NAF download failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "PipelineFailed"
      },
      HandleTransformError = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Transform",
            "status" : "ERROR",
            "message" : "Data transformation failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "PipelineFailed"
      },
      HandleIngestionError = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Ingestion",
            "status" : "ERROR",
            "message" : "RDS Ingestion failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "PipelineFailed"
      },
      HandleSyntheticError = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "SyntheticInjection",
            "status" : "ERROR",
            "message" : "Synthetic injection failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "PipelineFailed"
      },
      HandleEnrichmentError = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "PreEnrichment",
            "status" : "ERROR",
            "message" : "Spatial enrichment failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "PipelineFailed"
      },
      HandleIndexingError = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "Indexing",
            "status" : "ERROR",
            "message" : "OpenSearch indexing failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "PipelineFailed"
      },
      PipelineFailed = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          "FunctionName" : "${aws_lambda_function.progress_manager.arn}",
          "Payload" : {
            "execution_id.$" : "$$.Execution.Id",
            "step_name" : "PipelineStart",
            "status" : "ERROR",
            "message" : "Pipeline execution failed",
            "error_cause.$" : "$.error_info.Cause"
          }
        },
        ResultPath = "$.error_handler_result",
        Next       = "FailWorkflow"
      },
      FailWorkflow = {
        Type  = "Fail",
        Cause = "Pipeline failed due to error",
        Error = "PipelineFailed"
      }
    }
  })
}

# IAM Role for EventBridge Scheduler
resource "aws_iam_role" "scheduler_role" {
  name = "aws-geocoding-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "scheduler_policy" {
  name = "aws-geocoding-scheduler-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "states:StartExecution"
        Resource = aws_sfn_state_machine.orchestrator.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "scheduler_attach" {
  role       = aws_iam_role.scheduler_role.name
  policy_arn = aws_iam_policy.scheduler_policy.arn
}

# EventBridge Scheduler (Weekly Check)
resource "aws_scheduler_schedule" "weekly_check" {
  name       = "aws-geocoding-weekly-check"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  # Run at 2:00 AM every Sunday
  schedule_expression = "cron(0 2 ? * SUN *)"

  target {
    arn      = aws_sfn_state_machine.orchestrator.arn
    role_arn = aws_iam_role.scheduler_role.arn

    input = jsonencode({
      "trigger" : "scheduled",
      "task_definition_arn" : "arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:task-definition/${aws_ecs_task_definition.loader.family}"
    })
  }
}
