resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "aws-geocoding-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title = "Validator Lambda — Invocations & Errors"
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${aws_lambda_function.validator_lambda.function_name}"],
            ["AWS/Lambda", "Errors", "FunctionName", "${aws_lambda_function.validator_lambda.function_name}"]
          ]
          period = 300
          stat   = "Sum"
          region = "${data.aws_region.current.name}"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title = "Validator Lambda — Duration (p50/p95/p99)"
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", "${aws_lambda_function.validator_lambda.function_name}", { stat = "p50" }],
            ["AWS/Lambda", "Duration", "FunctionName", "${aws_lambda_function.validator_lambda.function_name}", { stat = "p95" }],
            ["AWS/Lambda", "Duration", "FunctionName", "${aws_lambda_function.validator_lambda.function_name}", { stat = "p99" }]
          ]
          period = 300
          region = "${data.aws_region.current.name}"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title = "API Gateway — Request Count & Errors"
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", "${aws_apigatewayv2_api.http_api.id}"],
            ["AWS/ApiGateway", "4xx", "ApiId", "${aws_apigatewayv2_api.http_api.id}"],
            ["AWS/ApiGateway", "5xx", "ApiId", "${aws_apigatewayv2_api.http_api.id}"]
          ]
          period = 300
          stat   = "Sum"
          region = "${data.aws_region.current.name}"
        }
      }
    ]
  })
}
