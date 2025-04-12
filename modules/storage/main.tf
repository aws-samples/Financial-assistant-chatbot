resource "aws_dynamodb_table" "chat_history" {
  name           = "${var.project_name}-chat-history-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  
  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  # In a production environment, you would want to change this to RETAIN
  deletion_protection_enabled = false

  tags = {
    Name        = "${var.project_name}-chat-history-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_s3_bucket" "financial_documents" {
  bucket = "${var.project_name}-financial-documents-${var.environment}"

  tags = {
    Name        = "${var.project_name}-financial-documents-${var.environment}"
    Environment = var.environment
  }

  # In a production environment, you would want to change this to true
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "financial_documents" {
  bucket = aws_s3_bucket.financial_documents.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "financial_documents" {
  bucket = aws_s3_bucket.financial_documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "financial_documents" {
  bucket = aws_s3_bucket.financial_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "financial_documents" {
  bucket = aws_s3_bucket.financial_documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceSSL"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.financial_documents.arn,
          "${aws_s3_bucket.financial_documents.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
