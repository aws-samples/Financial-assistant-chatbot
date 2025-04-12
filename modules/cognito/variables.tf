variable "project_name" {
  description = "The name of the project"
  type        = string
}

variable "environment" {
  description = "The environment name (e.g., dev, prod)"
  type        = string
}

variable "lambda_function_arn" {
  description = "The ARN of the Lambda function"
  type        = string
}

variable "lambda_function_url" {
  description = "The URL of the Lambda function URL"
  type        = string
}
