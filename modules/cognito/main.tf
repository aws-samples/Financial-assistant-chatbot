locals {
  user_pool_name = "${var.project_name}-user-pool-${var.environment}"
}

# Create the Cognito User Pool
resource "aws_cognito_user_pool" "user_pool" {
  name = local.user_pool_name
  
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
  
  # Enable advanced security features
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }
  
  tags = {
    Name        = local.user_pool_name
    Environment = var.environment
  }
}

# Create the Cognito User Pool Client
resource "aws_cognito_user_pool_client" "user_pool_client" {
  name                = "${var.project_name}-client-${var.environment}"
  user_pool_id        = aws_cognito_user_pool.user_pool.id
  
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_CUSTOM_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  
  generate_secret = false
}

# Create the Cognito Identity Pool
resource "aws_cognito_identity_pool" "identity_pool" {
  identity_pool_name               = "${var.project_name}-identity-pool-${var.environment}"
  allow_unauthenticated_identities = false
  
  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.user_pool_client.id
    provider_name           = aws_cognito_user_pool.user_pool.endpoint
    server_side_token_check = false
  }
  
  tags = {
    Name        = "${var.project_name}-identity-pool-${var.environment}"
    Environment = var.environment
  }
}

# Create the authenticated user role
resource "aws_iam_role" "authenticated_role" {
  name = "${var.project_name}-authenticated-role-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.identity_pool.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })
  
  tags = {
    Name        = "${var.project_name}-authenticated-role-${var.environment}"
    Environment = var.environment
  }
}

# Create the unauthenticated user role
resource "aws_iam_role" "unauthenticated_role" {
  name = "${var.project_name}-unauthenticated-role-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.identity_pool.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "unauthenticated"
          }
        }
      }
    ]
  })
  
  tags = {
    Name        = "${var.project_name}-unauthenticated-role-${var.environment}"
    Environment = var.environment
  }
}

# Create a policy for Lambda access
resource "aws_iam_policy" "lambda_access" {
  name        = "${var.project_name}-lambda-access-${var.environment}"
  description = "Policy for Lambda access"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "lambda:InvokeFunctionUrl",
          "lambda:InvokeFunction"
        ]
        Effect   = "Allow"
        Resource = var.lambda_function_arn
      }
    ]
  })
}

# Attach the Lambda access policy to the authenticated role
resource "aws_iam_role_policy_attachment" "lambda_access" {
  role       = aws_iam_role.authenticated_role.name
  policy_arn = aws_iam_policy.lambda_access.arn
}

# Create the Identity Pool Role Attachment
resource "aws_cognito_identity_pool_roles_attachment" "identity_pool_role_attachment" {
  identity_pool_id = aws_cognito_identity_pool.identity_pool.id
  
  roles = {
    authenticated   = aws_iam_role.authenticated_role.arn
    unauthenticated = aws_iam_role.unauthenticated_role.arn
  }
  
  role_mapping {
    identity_provider         = "${aws_cognito_user_pool.user_pool.endpoint}:${aws_cognito_user_pool_client.user_pool_client.id}"
    type                      = "Token"
    ambiguous_role_resolution = "AuthenticatedRole"
  }
}
