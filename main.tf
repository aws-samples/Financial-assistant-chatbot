locals {
  project_name = var.project_name
  environment  = var.environment
}

module "storage" {
  source = "./modules/storage"

  project_name = local.project_name
  environment  = local.environment
}

module "genai" {
  source = "./modules/genai"

  project_name = local.project_name
  environment  = local.environment
  
  archive_bucket_id        = module.storage.bucket_id
  archive_bucket_arn       = module.storage.bucket_arn
  use_aurora               = var.use_aurora
  embedding_model          = "cohere.embed-multilingual-v3"
  parsing_model            = "anthropic.claude-3-sonnet-20240229-v1:0"
}

module "lambda" {
  source = "./modules/lambda"

  project_name = local.project_name
  environment  = local.environment
  
  memory_size                         = var.lambda_memory_size
  timeout                             = var.lambda_timeout
  dynamodb_table_name                 = module.storage.dynamodb_table_name
  dynamodb_table_arn                  = module.storage.dynamodb_table_arn
  knowledge_base_id                   = module.genai.knowledge_base_id
  number_of_results                   = var.number_of_results
  number_of_chat_interactions_to_remember = var.number_of_chat_interactions_to_remember
  self_query_model_id                 = var.self_query_model_id
  condense_model_id                   = var.condense_model_id
  chat_model_id                       = var.chat_model_id
  language                            = var.language
  search_type                         = var.search_type
}

module "cognito" {
  source = "./modules/cognito"

  project_name = local.project_name
  environment  = local.environment
  
  lambda_function_arn = module.lambda.function_arn
  lambda_function_url = module.lambda.function_url
}
