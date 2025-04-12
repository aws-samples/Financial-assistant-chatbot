provider "aws" {
  region = "us-west-2"
}

provider "awscc" {
  region = "us-west-2"
}

module "financial_assistant_chatbot" {
  source = "../../"
  
  aws_region  = "us-west-2"
  environment = "dev"
  project_name = "financial-assistant-chatbot"
  
  # Lambda configuration
  lambda_memory_size = 512
  lambda_timeout     = 300 # 5 minutes
  
  # Bedrock configuration
  number_of_results = 15
  number_of_chat_interactions_to_remember = 10
  self_query_model_id = "anthropic.claude-3-haiku-20240307-v1:0"
  condense_model_id   = "anthropic.claude-3-haiku-20240307-v1:0"
  chat_model_id       = "anthropic.claude-3-5-sonnet-20240620-v1:0"
  language            = "english"
  search_type         = "HYBRID"
  
  # Set to true to use Aurora as the vector store
  use_aurora = false
}

output "rest_api_endpoint" {
  description = "The URL of the Lambda function URL"
  value       = module.financial_assistant_chatbot.rest_api_endpoint
}

output "lambda_function_arn" {
  description = "The ARN of the Lambda function"
  value       = module.financial_assistant_chatbot.lambda_function_arn
}

output "knowledge_base_id" {
  description = "The ID of the Bedrock Knowledge Base"
  value       = module.financial_assistant_chatbot.knowledge_base_id
}

output "resume_bucket_name" {
  description = "The name of the S3 bucket for financial documents"
  value       = module.financial_assistant_chatbot.resume_bucket_name
}

output "cognito_user_pool_id" {
  description = "The ID of the Cognito User Pool"
  value       = module.financial_assistant_chatbot.cognito_user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "The ID of the Cognito User Pool Client"
  value       = module.financial_assistant_chatbot.cognito_user_pool_client_id
}

output "cognito_identity_pool_id" {
  description = "The ID of the Cognito Identity Pool"
  value       = module.financial_assistant_chatbot.cognito_identity_pool_id
}
