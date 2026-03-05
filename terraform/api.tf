resource "aws_apigatewayv2_api" "http_api" {
  name          = "aws-geocoding-api"
  protocol_type = "HTTP"
  description   = "Secured API for Address Validation - Sprint 7.1"

  # Native CORS — API Gateway handles OPTIONS preflight automatically
  cors_configuration {
    allow_origins = ["http://localhost:5173", "https://d2l9s94q3vy56m.cloudfront.net"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type", "x-api-key", "Origin", "Accept", "X-Amz-Date", "X-Amz-Security-Token", "X-Amz-User-Agent", "X-Requested-With"]
    expose_headers = ["Access-Control-Allow-Origin", "Access-Control-Allow-Methods"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true

  # Throttling — prevent API abuse
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 20
  }
}

# Cognito JWT Authorizer — validates short-lived tokens (OIDC-compliant)
resource "aws_apigatewayv2_authorizer" "cognito_jwt" {
  api_id           = aws_apigatewayv2_api.http_api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.user_pool_client.id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.user_pool.id}"
  }
}

resource "aws_apigatewayv2_integration" "validator_integration" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"

  connection_type    = "INTERNET" # Lambda is in VPC but invocation is standard
  description        = "Proxy to Validator Lambda"
  integration_method = "POST"
  integration_uri    = aws_lambda_function.validator_lambda.invoke_arn
}

resource "aws_apigatewayv2_route" "geocode_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /geocode"
  target             = "integrations/${aws_apigatewayv2_integration.validator_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

resource "aws_apigatewayv2_integration" "progress_integration" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"

  connection_type    = "INTERNET"
  description        = "Proxy to Progress Manager Lambda"
  integration_method = "POST"
  integration_uri    = aws_lambda_function.progress_manager.invoke_arn
}

resource "aws_apigatewayv2_route" "refresh_get_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /refresh"
  target             = "integrations/${aws_apigatewayv2_integration.progress_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

resource "aws_apigatewayv2_route" "refresh_post_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /refresh"
  target             = "integrations/${aws_apigatewayv2_integration.progress_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

resource "aws_apigatewayv2_route" "refresh_delete_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "DELETE /refresh"
  target             = "integrations/${aws_apigatewayv2_integration.progress_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

resource "aws_apigatewayv2_route" "refresh_schedule_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /refresh/schedule"
  target             = "integrations/${aws_apigatewayv2_integration.progress_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

resource "aws_apigatewayv2_route" "refresh_get_schedule_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /refresh/schedule"
  target             = "integrations/${aws_apigatewayv2_integration.progress_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

resource "aws_apigatewayv2_route" "refresh_stop_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "POST /refresh/stop"
  target             = "integrations/${aws_apigatewayv2_integration.progress_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

resource "aws_apigatewayv2_route" "refresh_health_route" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /refresh/health"
  target             = "integrations/${aws_apigatewayv2_integration.progress_integration.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.api_key_authorizer.id
}

# OPTIONS route removed — native cors_configuration handles preflight automatically

# Permission for API Gateway to invoke Progress Lambda
resource "aws_lambda_permission" "api_gw_progress" {
  statement_id  = "AllowExecutionFromAPIGatewayProgress"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.progress_manager.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# Permission for API Gateway to invoke Lambda
resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.validator_lambda.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# Output the API Endpoint
output "api_endpoint" {
  value = aws_apigatewayv2_api.http_api.api_endpoint
}
