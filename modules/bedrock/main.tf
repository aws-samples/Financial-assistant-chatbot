locals {
  kb_name = "${var.project_name}-knowledge-base-${var.environment}"
  ds_name = "${var.project_name}-data-source-${var.environment}"
}

# Create the parsing prompt for the Bedrock Knowledge Base
resource "aws_ssm_parameter" "parsing_prompt" {
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

# Create an IAM role for the Bedrock service
resource "aws_iam_role" "bedrock_service_role" {
  name = "${var.project_name}-bedrock-service-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "bedrock.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-bedrock-service-role-${var.environment}"
    Environment = var.environment
  }
}

# Create a policy for S3 access
resource "aws_iam_policy" "s3_access" {
  name        = "${var.project_name}-s3-access-${var.environment}"
  description = "Policy for S3 access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Effect   = "Allow"
        Resource = [
          var.archive_bucket_arn,
          "${var.archive_bucket_arn}/*"
        ]
      }
    ]
  })
}

# Attach the S3 access policy to the Bedrock service role
resource "aws_iam_role_policy_attachment" "s3_access" {
  role       = aws_iam_role.bedrock_service_role.name
  policy_arn = aws_iam_policy.s3_access.arn
}

# Create a policy for Bedrock model access
resource "aws_iam_policy" "bedrock_model_access" {
  name        = "${var.project_name}-bedrock-model-access-${var.environment}"
  description = "Policy for Bedrock model access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "bedrock:InvokeModel"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

# Attach the Bedrock model access policy to the Bedrock service role
resource "aws_iam_role_policy_attachment" "bedrock_model_access" {
  role       = aws_iam_role.bedrock_service_role.name
  policy_arn = aws_iam_policy.bedrock_model_access.arn
}

# Create Aurora PostgreSQL database if use_aurora is true
resource "aws_rds_cluster" "aurora_vector_store" {
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

# Create the Bedrock Knowledge Base
resource "awscc_bedrock_knowledge_base" "financial_documents" {
  name        = local.kb_name
  description = "Knowledge base for financial documents"
  role_arn    = aws_iam_role.bedrock_service_role.arn
  
  knowledge_base_configuration = {
    type = "VECTOR"
    vector_knowledge_base_configuration = {
      embedding_model_arn = var.embedding_model
    }
  }
  
  storage_configuration = {
    type = "OPENSEARCH_SERVERLESS"
  }
  
  tags = {
    Name        = local.kb_name
    Environment = var.environment
  }
}

# Create the Bedrock Data Source
resource "aws_bedrockagent_data_source" "financial_documents" {
  knowledge_base_id = awscc_bedrock_knowledge_base.financial_documents.id
  name              = local.ds_name
  
  data_source_configuration {
    type = "S3"
    s3_configuration {
      bucket_arn = var.archive_bucket_arn
    }
  }
  
  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = "SEMANTIC"
    }
  }
}
