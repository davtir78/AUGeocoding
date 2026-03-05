output "user_pool_id" {
  value = aws_cognito_user_pool.user_pool.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.user_pool_client.id
}

output "region" {
  value = data.aws_region.current.name
}

output "identity_pool_id" {
  value = aws_cognito_identity_pool.identity_pool.id
}

output "orchestrator_arn" {
  value = aws_sfn_state_machine.orchestrator.arn
}

output "validator_arn" {
  value = aws_lambda_function.validator_lambda.arn
}

output "loader_arn" {
  value = aws_lambda_function.loader_lambda.arn
}
