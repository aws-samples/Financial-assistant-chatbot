variable "project_name" {
  description = "The name of the project"
  type        = string
}

variable "environment" {
  description = "The environment name (e.g., dev, prod)"
  type        = string
}

variable "memory_size" {
  description = "Memory size for the Lambda function in MB"
  type        = number
  default     = 512
}

variable "timeout" {
  description = "Timeout for the Lambda function in seconds"
  type        = number
  default     = 300 # 5 minutes
}

variable "dynamodb_table_name" {
  description = "The name of the DynamoDB table for chat history"
  type        = string
}

variable "dynamodb_table_arn" {
  description = "The ARN of the DynamoDB table for chat history"
  type        = string
}

variable "knowledge_base_id" {
  description = "The ID of the Bedrock Knowledge Base"
  type        = string
}

variable "number_of_results" {
  description = "Number of results to return from the knowledge base"
  type        = number
  default     = 15
}

variable "number_of_chat_interactions_to_remember" {
  description = "Number of chat interactions to remember"
  type        = number
  default     = 10
}

variable "self_query_model_id" {
  description = "Bedrock model ID for self-query"
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "condense_model_id" {
  description = "Bedrock model ID for condensing"
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "chat_model_id" {
  description = "Bedrock model ID for chat"
  type        = string
  default     = "anthropic.claude-3-5-sonnet-20240620-v1:0"
}

variable "language" {
  description = "Language for the chat responses"
  type        = string
  default     = "english"
}

variable "search_type" {
  description = "Search type for the knowledge base (HYBRID or SEMANTIC)"
  type        = string
  default     = "HYBRID"
}
