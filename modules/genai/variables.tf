variable "project_name" {
  description = "The name of the project"
  type        = string
}

variable "environment" {
  description = "The environment name (e.g., dev, prod)"
  type        = string
}

variable "archive_bucket_id" {
  description = "The ID of the S3 bucket for financial documents"
  type        = string
}

variable "archive_bucket_arn" {
  description = "The ARN of the S3 bucket for financial documents"
  type        = string
}

variable "use_aurora" {
  description = "Whether to use Aurora as the vector store"
  type        = bool
  default     = false
}

variable "embedding_model" {
  description = "The Bedrock embedding model to use"
  type        = string
  default     = "cohere.embed-multilingual-v3"
}

variable "parsing_model" {
  description = "The Bedrock parsing model to use"
  type        = string
  default     = "anthropic.claude-3-sonnet-20240229-v1:0"
}
