#!/bin/bash

# Script to initialize and deploy the Terraform project

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
  print_error "Environment not specified. Usage: ./deploy.sh <environment> [command]"
  print_message "Available environments: dev"
  exit 1
fi

ENVIRONMENT=$1
COMMAND=${2:-plan}

# Check if environment directory exists
if [ ! -d "environments/$ENVIRONMENT" ]; then
  print_error "Environment '$ENVIRONMENT' not found. Available environments: dev"
  exit 1
fi

# Check if command is valid
if [[ ! "$COMMAND" =~ ^(init|plan|apply|destroy)$ ]]; then
  print_error "Invalid command '$COMMAND'. Available commands: init, plan, apply, destroy"
  exit 1
fi

# Change to environment directory
cd "environments/$ENVIRONMENT"

# Execute the command
case $COMMAND in
  init)
    print_message "Initializing Terraform for environment '$ENVIRONMENT'..."
    terraform init
    ;;
  plan)
    print_message "Planning Terraform deployment for environment '$ENVIRONMENT'..."
    terraform plan
    ;;
  apply)
    print_message "Applying Terraform deployment for environment '$ENVIRONMENT'..."
    terraform apply
    ;;
  destroy)
    print_warning "This will destroy all resources in environment '$ENVIRONMENT'."
    read -p "Are you sure you want to continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      print_message "Destroying Terraform deployment for environment '$ENVIRONMENT'..."
      terraform destroy
    else
      print_message "Destroy operation cancelled."
    fi
    ;;
esac

print_message "Operation completed."
