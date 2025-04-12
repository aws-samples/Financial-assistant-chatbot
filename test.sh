#!/bin/bash

# Script to validate the Terraform configuration

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_message() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if environment is provided
if [ -z "$1" ]; then
  print_error "Environment not specified. Usage: ./test.sh <environment>"
  print_message "Available environments: dev"
  exit 1
fi

ENVIRONMENT=$1

# Check if environment directory exists
if [ ! -d "environments/$ENVIRONMENT" ]; then
  print_error "Environment '$ENVIRONMENT' not found. Available environments: dev"
  exit 1
fi

# Change to environment directory
cd "environments/$ENVIRONMENT"

# Validate the Terraform configuration
print_message "Validating Terraform configuration for environment '$ENVIRONMENT'..."
terraform init -backend=false
terraform validate

if [ $? -eq 0 ]; then
  print_message "Terraform configuration is valid."
else
  print_error "Terraform configuration is invalid."
  exit 1
fi

# Run terraform fmt to check for formatting issues
print_message "Checking Terraform formatting..."
cd ../..
terraform fmt -check -recursive

if [ $? -eq 0 ]; then
  print_message "Terraform formatting is correct."
else
  print_warning "Terraform formatting issues found. Run 'terraform fmt -recursive' to fix."
fi

print_message "All tests completed."
