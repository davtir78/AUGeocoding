resource "aws_dynamodb_table" "api_keys" {
  name         = "aws-geocoding-api-keys"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "api_key"

  attribute {
    name = "api_key"
    type = "S"
  }

  tags = {
    Name = "aws-geocoding-api-keys"
  }
}

# -----------------
# API Key Authorizer Lambda
# -----------------
data "archive_file" "api_key_authorizer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/lambdas/api_key_authorizer"
  output_path = "${path.module}/api_key_authorizer.zip"
}

resource "aws_iam_role" "api_key_authorizer_role" {
  name = "aws-geocoding-api-key-authorizer-role"

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

resource "aws_iam_role_policy_attachment" "api_key_authorizer_basic_execution" {
  role       = aws_iam_role.api_key_authorizer_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api_key_authorizer_dynamodb" {
  name = "aws-geocoding-api-key-authorizer-dynamodb"
  role = aws_iam_role.api_key_authorizer_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:GetItem"
        ]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.api_keys.arn
      }
    ]
  })
}

resource "aws_lambda_function" "api_key_authorizer" {
  filename         = data.archive_file.api_key_authorizer_zip.output_path
  function_name    = "aws-geocoding-api-key-authorizer"
  role             = aws_iam_role.api_key_authorizer_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.api_key_authorizer_zip.output_base64sha256
  runtime          = "python3.11"
  timeout          = 5

  environment {
    variables = {
      API_KEYS_TABLE = aws_dynamodb_table.api_keys.name
    }
  }
}

# The actual setup of the API Gateway authorizer for routes requires updating those routes.
# Currently, all functional routes in api.tf are using `jwt_authorizer`.
resource "aws_apigatewayv2_authorizer" "api_key_authorizer" {
  api_id                            = aws_apigatewayv2_api.http_api.id
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.api_key_authorizer.invoke_arn
  identity_sources                  = ["$request.header.x-api-key"]
  name                              = "api-key-authorizer"
  authorizer_payload_format_version = "2.0"
}

resource "aws_lambda_permission" "api_key_authorizer_permission" {
  statement_id  = "AllowAPIGatewayInvokeAPIKeyAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_key_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
