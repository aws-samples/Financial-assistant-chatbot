# Get current AWS region and account ID
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  kb_name = "${var.project_name}-knowledge-base-${var.environment}"
  ds_name = "${var.project_name}-data-source-${var.environment}"
}

# Create the parsing prompt for the Bedrock Knowledge Base
resource "aws_ssm_parameter" "parsing_prompt" {
  #checkov:skip=CKV2_AWS_34:AWS SSM Parameter should be Encrypted - For prototyping we are intentionally not encrypting the LLM prompts. We recommend you evaluate your need in production.

  name  = "/${var.project_name}/${var.environment}/parsing-prompt"
  type  = "String"
  value = <<-EOT
Transcribe the text content from an image page and output in Markdown syntax (not code blocks). Follow these steps:

1. Examine the provided page carefully.

2. Identify all elements present in the page, including headers, body text, footnotes, tables, visualizations, captions, and page numbers, etc.

3. Use markdown syntax to format your output:
    - Headings: # for main, ## for sections, ### for subsections, etc.
    - Lists: * or - for bulleted, 1. 2. 3. for numbered
    - Do not repeat yourself

4. If the element is a visualization
    - Provide a detailed description in natural language
    - Do not transcribe text in the visualization after providing the description

5. If the element is a table
    - Create a markdown table, ensuring every row has the same number of columns
    - Maintain cell alignment as closely as possible
    - Do not split a table into multiple tables
    - If a merged cell spans multiple rows or columns, place the text in the top-left cell and output ' ' for other
    - Use | for column separators, |-|-| for header row separators
    - If a cell has multiple items, list them in separate rows
    - If the table contains sub-headers, separate the sub-headers from the headers in another row
    - Take a deep breath and, thinking step by step, look at the data in the table presented.
    - Please create a description for the data in the table that contains insights and relevant information for other advisors. Your summary must be written in English.

6. If the element is a paragraph
    - Transcribe each text element precisely as it appears

7. If the element is a header, footer, footnote, page number
    - Transcribe each text element precisely as it appears

Output Example:

A bar chart showing annual sales figures, with the y-axis labeled "Sales ($Million)" and the x-axis labeled "Year". The chart has bars for 2018 ($12M), 2019 ($18M), 2020 ($8M), and 2021 ($22M).
Figure 3: This chart shows annual sales in millions. The year 2020 was significantly down due to the COVID-19 pandemic.

# Annual Report

## Financial Highlights

* Revenue: $40M
* Profit: $12M
* EPS: $1.25

Here is the image.
  EOT

  tags = {
    Name        = "${var.project_name}-parsing-prompt-${var.environment}"
    Environment = var.environment
  }
}

# Create Aurora PostgreSQL database if use_aurora is true
resource "aws_rds_cluster" "aurora_vector_store" {
  #checkov:skip=CKV2_AWS_27:Ensure Postgres RDS as aws_rds_cluster has Query Logging enabled - For prototyping we are intentionally not setting this up. We recommend you evaluate your need in production. 
  #checkov:skip=CKV2_AWS_8:Ensure that RDS clusters has backup plan of AWS Backup - For prototyping we are intentionally not setting up backups. We recommend you evaluate your need in production.
  
  count = var.use_aurora ? 1 : 0

  cluster_identifier      = "${var.project_name}-aurora-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4"
  engine_mode             = "provisioned"
  database_name           = "vectordb"
  master_username         = "postgres"
  master_password         = random_password.aurora_password[0].result
  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"
  skip_final_snapshot     = true
  
  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 1.0
  }

  tags = {
    Name        = "${var.project_name}-aurora-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "aurora_instances" {
  count = var.use_aurora ? 1 : 0

  identifier         = "${var.project_name}-aurora-instance-${var.environment}"
  cluster_identifier = aws_rds_cluster.aurora_vector_store[0].id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora_vector_store[0].engine
  engine_version     = aws_rds_cluster.aurora_vector_store[0].engine_version
  
  tags = {
    Name        = "${var.project_name}-aurora-instance-${var.environment}"
    Environment = var.environment
  }
}

resource "random_password" "aurora_password" {
  count   = var.use_aurora ? 1 : 0
  length  = 16
  special = false
}

resource "aws_secretsmanager_secret" "aurora_credentials" {
  #checkov:skip=CKV2_AWS_57:Ensure Secrets Manager secrets should have automatic rotation enabled - For prototyping we are intentionally not rotating the rds password. We recommend you evaluate your need in production.

  count = var.use_aurora ? 1 : 0
  
  name = "${var.project_name}-aurora-credentials-${var.environment}"
  
  tags = {
    Name        = "${var.project_name}-aurora-credentials-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "aurora_credentials" {
  count = var.use_aurora ? 1 : 0
  
  secret_id = aws_secretsmanager_secret.aurora_credentials[0].id
  secret_string = jsonencode({
    username             = aws_rds_cluster.aurora_vector_store[0].master_username
    password             = aws_rds_cluster.aurora_vector_store[0].master_password
    engine               = "postgres"
    host                 = aws_rds_cluster.aurora_vector_store[0].endpoint
    port                 = aws_rds_cluster.aurora_vector_store[0].port
    dbClusterIdentifier  = aws_rds_cluster.aurora_vector_store[0].cluster_identifier
  })
}

# Use the aws-ia/bedrock/aws module to create the Bedrock Knowledge Base
module "bedrock" {
  #checkov:skip=CKV_TF_1:Ensure Terraform module sources use a commit hash - We are intentionally pinning to a version number and source.
  source  = "aws-ia/bedrock/aws"
  version = "0.0.20"
  
  # Create a default knowledge base with OpenSearch Serverless
  create_default_kb = true
  create_agent = false
  
  # Knowledge base configuration
  kb_name = local.kb_name
  kb_description = "Knowledge base for financial documents"
  kb_embedding_model_arn = "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/${var.embedding_model}"

  # Datasource configuration
  create_parsing_configuration = true
  parsing_config_model_arn = "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/${var.parsing_model}"
  
  # S3 data source configuration
  create_s3_data_source = true
  use_existing_s3_data_source = true
  kb_s3_data_source = var.archive_bucket_arn
  
  # Tags
  tags = {
    Name        = local.kb_name
    Environment = var.environment
    Project     = var.project_name
  }
}

# Configure the OpenSearch provider to use the collection endpoint from the module
provider "opensearch" {
  url         = module.bedrock.default_collection.collection_endpoint
  healthcheck = false
}