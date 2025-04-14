output "knowledge_base_id" {
  description = "The ID of the Bedrock Knowledge Base"
  value       = module.bedrock.default_kb_identifier
}

output "data_source_id" {
  description = "The ID of the Bedrock Data Source"
  value       = module.bedrock.s3_data_source_name
}

output "opensearch_collection" {
  description = "The OpenSearch Serverless collection created by the Bedrock module"
  value       = module.bedrock.default_collection
}

output "aurora_secrets_arn" {
  description = "The ARN of the Aurora Secrets (only if use_aurora is true)"
  value       = var.use_aurora ? aws_secretsmanager_secret.aurora_credentials[0].arn : null
}

output "aurora_endpoint" {
  description = "The endpoint of the Aurora cluster (only if use_aurora is true)"
  value       = var.use_aurora ? aws_rds_cluster.aurora_vector_store[0].endpoint : null
}

output "aurora_reader_endpoint" {
  description = "The reader endpoint of the Aurora cluster (only if use_aurora is true)"
  value       = var.use_aurora ? aws_rds_cluster.aurora_vector_store[0].reader_endpoint : null
}

output "aurora_cluster_id" {
  description = "The ID of the Aurora cluster (only if use_aurora is true)"
  value       = var.use_aurora ? aws_rds_cluster.aurora_vector_store[0].id : null
}
