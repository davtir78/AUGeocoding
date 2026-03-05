# ──────────────────────────────────────────────────────────────────
# SNS Topic for Alarm Notifications
# ──────────────────────────────────────────────────────────────────
resource "aws_sns_topic" "alerts" {
  name = "aws-geocoding-alerts"
}

# Subscribe your email to receive alarm notifications.
# After terraform apply, you MUST confirm the subscription via
# the email you receive from AWS.
resource "aws_sns_topic_subscription" "email_alert" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "your-email@example.com" # <<< CHANGE THIS BEFORE APPLY OR IN AWS CONSOLE
}

# ──────────────────────────────────────────────────────────────────
# Alarm 1: Pipeline Failure Detection
# ──────────────────────────────────────────────────────────────────
# Fires when the Step Functions orchestrator enters a FAILED state.
resource "aws_cloudwatch_metric_alarm" "pipeline_failure" {
  alarm_name          = "aws-geocoding-pipeline-failure"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 1 # Alert on ANY failure
  alarm_description   = "Pipeline orchestrator execution failed"

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.orchestrator.arn
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ──────────────────────────────────────────────────────────────────
# Alarm 2: Validator Lambda Errors
# ──────────────────────────────────────────────────────────────────
# Fires when the validator Lambda has more than 5 errors in 5 minutes.
resource "aws_cloudwatch_metric_alarm" "validator_errors" {
  alarm_name          = "aws-geocoding-validator-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Validator Lambda error rate is elevated"

  dimensions = {
    FunctionName = aws_lambda_function.validator_lambda.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ──────────────────────────────────────────────────────────────────
# Alarm 3: Validator Latency (P95)
# ──────────────────────────────────────────────────────────────────
# Fires when p95 latency exceeds 2 seconds (indicating degradation).
resource "aws_cloudwatch_metric_alarm" "validator_latency" {
  alarm_name          = "aws-geocoding-validator-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3 # Must exceed for 3 consecutive periods
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  extended_statistic  = "p95" # 95th percentile
  threshold           = 2000  # 2 seconds in milliseconds
  alarm_description   = "Validator Lambda p95 latency exceeds 2 seconds"

  dimensions = {
    FunctionName = aws_lambda_function.validator_lambda.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ──────────────────────────────────────────────────────────────────
# Alarm 4: API Gateway 4xx/5xx Error Rate
# ──────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "api_5xx_errors" {
  alarm_name          = "aws-geocoding-api-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "API Gateway 5xx error rate is elevated"

  dimensions = {
    ApiId = aws_apigatewayv2_api.http_api.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

