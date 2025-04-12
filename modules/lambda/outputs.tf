output "function_arn" {
  description = "The ARN of the Lambda function"
  value       = aws_lambda_function.bot_chain.arn
}

output "function_name" {
  description = "The name of the Lambda function"
  value       = aws_lambda_function.bot_chain.function_name
}

output "function_url" {
  description = "The URL of the Lambda function URL"
  value       = aws_lambda_function_url.bot_chain.function_url
}
