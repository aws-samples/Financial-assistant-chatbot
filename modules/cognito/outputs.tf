output "user_pool_id" {
  description = "The ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.user_pool.id
}

output "user_pool_arn" {
  description = "The ARN of the Cognito User Pool"
  value       = aws_cognito_user_pool.user_pool.arn
}

output "user_pool_endpoint" {
  description = "The endpoint of the Cognito User Pool"
  value       = aws_cognito_user_pool.user_pool.endpoint
}

output "user_pool_client_id" {
  description = "The ID of the Cognito User Pool Client"
  value       = aws_cognito_user_pool_client.user_pool_client.id
}

output "identity_pool_id" {
  description = "The ID of the Cognito Identity Pool"
  value       = aws_cognito_identity_pool.identity_pool.id
}

output "authenticated_role_arn" {
  description = "The ARN of the authenticated user role"
  value       = aws_iam_role.authenticated_role.arn
}

output "unauthenticated_role_arn" {
  description = "The ARN of the unauthenticated user role"
  value       = aws_iam_role.unauthenticated_role.arn
}
