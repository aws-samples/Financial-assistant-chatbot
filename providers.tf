provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Financial-Assistant-Chatbot"
      Environment = var.environment
      Terraform   = "true"
    }
  }
}

provider "awscc" {
  region = var.aws_region
}
