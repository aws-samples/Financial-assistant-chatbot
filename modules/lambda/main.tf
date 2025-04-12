locals {
  function_name = "${var.project_name}-bot-chain-${var.environment}"
  lambda_src_dir = "${path.module}/src"
}

# Create the IAM role for the Lambda function
resource "aws_iam_role" "lambda_role" {
  name = "${local.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${local.function_name}-role"
    Environment = var.environment
  }
}

# Attach the basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Create a policy for DynamoDB access
resource "aws_iam_policy" "dynamodb_access" {
  name        = "${local.function_name}-dynamodb-access"
  description = "Policy for DynamoDB access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ]
        Effect   = "Allow"
        Resource = var.dynamodb_table_arn
      }
    ]
  })
}

# Attach the DynamoDB policy to the Lambda role
resource "aws_iam_role_policy_attachment" "dynamodb_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.dynamodb_access.arn
}

# Create a policy for Bedrock access
resource "aws_iam_policy" "bedrock_access" {
  name        = "${local.function_name}-bedrock-access"
  description = "Policy for Bedrock access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ]
        Effect = "Allow"
        Resource = [
          "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
          "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0"
        ]
      },
      {
        Action = [
          "bedrock:Retrieve"
        ]
        Effect = "Allow"
        Resource = [
          "arn:aws:bedrock:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:knowledge-base/*"
        ]
      },
      {
        Action = [
          "kms:Decrypt"
        ]
        Effect = "Allow"
        Resource = [
          "arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"
        ]
      }
    ]
  })
}

# Attach the Bedrock policy to the Lambda role
resource "aws_iam_role_policy_attachment" "bedrock_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.bedrock_access.arn
}

# Get current AWS region and account ID
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# Create a zip archive of the Lambda function code
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/lambda_function.zip"
}

# Create the Lambda function
resource "aws_lambda_function" "bot_chain" {
  function_name = local.function_name
  description   = "Financial Assistant Chatbot Lambda Function"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  
  memory_size = var.memory_size
  timeout     = var.timeout

  environment {
    variables = {
      DYNAMODB_HISTORY_TABLE_NAME           = var.dynamodb_table_name
      NUMBER_OF_RESULTS                     = var.number_of_results
      NUMBER_OF_CHAT_INTERACTIONS_TO_REMEMBER = var.number_of_chat_interactions_to_remember
      SELF_QUERY_MODEL_ID                   = var.self_query_model_id
      CONDENSE_MODEL_ID                     = var.condense_model_id
      CHAT_MODEL_ID                         = var.chat_model_id
      LANGUAGE                              = var.language
      LANGCHAIN_VERBOSE                     = "false"
      KNOWLEDGE_BASE_ID                     = var.knowledge_base_id
      SEARCH_TYPE                           = var.search_type
      AWS_REGION                            = data.aws_region.current.name
    }
  }

  tags = {
    Name        = local.function_name
    Environment = var.environment
  }
}

# Create the Lambda function URL
resource "aws_lambda_function_url" "bot_chain" {
  function_name      = aws_lambda_function.bot_chain.function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "RESPONSE_STREAM"

  cors {
    allow_credentials = true
    allow_origins     = ["*"] # In production, you would want to restrict this
    allow_methods     = ["POST"]
    allow_headers     = ["*"]
    expose_headers    = ["*"]
    max_age           = 86400
  }
}
