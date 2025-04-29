# Financial Assistant Chatbot - Terraform

This project is a Terraform implementation of the [Financial Assistant Chatbot](https://github.com/aws-samples/Financial-assistant-chatbot) originally built with AWS CDK.

## Architecture

The Financial Assistant Chatbot is a web application that allows users to chat with a financial assistant powered by Amazon Bedrock. The assistant can answer questions about financial documents stored in an S3 bucket and indexed in a Bedrock Knowledge Base.

The architecture consists of:

- **Amazon Cognito** for user authentication
- **Amazon DynamoDB** for storing chat history
- **Amazon S3** for storing financial documents
- **Amazon Bedrock** for the AI models and Knowledge Base
- **AWS Lambda** for the backend API

## Project Structure

```
project-root/
├── main.tf           # Main entry point, calling modules
├── variables.tf      # Input variables declaration
├── outputs.tf        # Output values
├── providers.tf      # Provider configuration
├── versions.tf       # Terraform and provider version constraints
├── terraform.tfvars  # Variable values
├── README.md         # Project documentation
├── modules/          # Reusable modules folder
│   ├── lambda/       # Lambda function module
│   ├── genai/        # Generative AI module, uses the [aws-ia/bedrock](https://github.com/aws-ia/terraform-aws-bedrock) module
│   ├── cognito/      # Cognito module
│   └── storage/      # DynamoDB and S3 module
└── environments/     # Environment-specific configurations
    └── dev/          # Development environment
```

## Prerequisites

- Terraform >= v1.11.4
- AWS CLI configured with appropriate credentials
- Access to Amazon Bedrock models (Claude 3 Haiku and Claude 3.5 Sonnet)

## Deployment

1. Clone the repository
2. Navigate to the dev environment directory `environments/dev`
   ```
   cd environments/dev
   ```
3. Initialize Terraform:
   ```
   terraform init
   ```
4. Review the deployment plan:
   ```
   terraform plan
   ```
5. Apply the changes:
   ```
   terraform apply
   ```

## Configuration

The project can be configured through the `terraform.tfvars` file. Key configuration options include:

- `aws_region`: The AWS region to deploy to (default: us-east-1)
- `environment`: The environment name (default: dev)
- `use_aurora`: Whether to use Aurora as the vector store (default: false)
- `search_type`: Search type for the knowledge base (HYBRID or SEMANTIC)
- Various model IDs and parameters for the Lambda function

## Ingesting files for the first time

To prime our Knowledge Base we need to ingest one or more documents. The `ingest_files.py` companion script automates that. Simply run:

```
python ingest_files.py --env dev --region REGION_NAME
```

## Configuring the frontend application

In order to use the frontend application you will need to pass it some environment variables.

To create a `.env` file containing all the necessary configuration run:

```
python generate_frontend_env.py --env dev --region REGION_NAME
```

Copy the results, we will use below.

After that, you should switch back to the main branch of this repository which contains the frontend application.

```
git checkout main
cd src/webapp
```

Now create a `.env` file in this folder and paste the contents of the configuration.

You are now ready to run the frontend

```
npm ci
npm run dev
```

## Aurora Vector Store Option

The project supports two vector store options:
1. Default Bedrock Knowledge Base vector store using Amazon OpenSearch Service Serverless
2. Amazon Aurora PostgreSQL vector store

To use Aurora, set `use_aurora = true` in the `terraform.tfvars` file.

## Cleanup

To remove all resources created by this project:

```
terraform destroy
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
