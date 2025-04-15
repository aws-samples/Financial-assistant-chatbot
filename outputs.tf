output "rest_api_endpoint" {
  description = "The URL of the Lambda function URL"
  value       = module.lambda.function_url
}

output "lambda_function_arn" {
  description = "The ARN of the Lambda function"
  value       = module.lambda.function_arn
}

output "knowledge_base_id" {
  description = "The ID of the Bedrock Knowledge Base"
  value       = module.genai.knowledge_base_id
}

output "resume_bucket_name" {
  description = "The name of the S3 bucket for financial documents"
  value       = module.storage.bucket_name
}

output "bucket_id" {
  description = "The ID of the S3 bucket for financial documents"
  value       = module.storage.bucket_id
}

output "data_source_id" {
  description = "The ID of the Bedrock Data Source"
  value       = module.genai.data_source_id
}

output "cognito_user_pool_id" {
  description = "The ID of the Cognito User Pool"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "The ID of the Cognito User Pool Client"
  value       = module.cognito.user_pool_client_id
}

output "cognito_identity_pool_id" {
  description = "The ID of the Cognito Identity Pool"
  value       = module.cognito.identity_pool_id
}

output "aurora_secrets_arn" {
  description = "The ARN of the Aurora Secrets (only if use_aurora is true)"
  value       = var.use_aurora ? module.genai.aurora_secrets_arn : null
}
