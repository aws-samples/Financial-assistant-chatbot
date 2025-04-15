# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

# Permission is hereby granted, free of charge, to any person obtaining a copy of this
# software and associated documentation files (the "Software"), to deal in the Software
# without restriction, including without limitation the rights to use, copy, modify,
# merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
# PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
# HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
# OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import argparse
import boto3
import json
import os
import subprocess
import time


def get_terraform_outputs(environment="dev"):
    """
    Get outputs from Terraform using the CLI for the specified environment.
    
    Args:
        environment (str): Environment name (dev, prod, etc.)
    
    Returns:
        dict: Terraform outputs as a dictionary.
    """
    env_dir = os.path.join("environments", environment)
    
    try:
        # Change to the environment directory
        current_dir = os.getcwd()
        os.chdir(env_dir)
        
        # Run terraform output command in JSON format
        result = subprocess.run(
            ["terraform", "output", "-json"],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Change back to original directory
        os.chdir(current_dir)
        
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error running terraform output in {env_dir}: {e}")
        print(f"stderr: {e.stderr}")
        
        # Change back to original directory in case of error
        if os.getcwd() != current_dir:
            os.chdir(current_dir)
        raise
    except json.JSONDecodeError:
        print(f"Error parsing terraform output as JSON")
        
        # Change back to original directory in case of error
        if os.getcwd() != current_dir:
            os.chdir(current_dir)
        raise


def upload_to_s3(s3_bucket_name, region_name: str):
    s3 = boto3.client("s3", region_name=region_name)
    data_dir = "./data"
    files = os.listdir(data_dir)

    for file in files:
        file_path = os.path.join(data_dir, file)
        key = f"{file}"
        try:
            s3.upload_file(file_path, s3_bucket_name, key)
            print(f"Successfully uploaded {file} to {s3_bucket_name}/{key}")
        except Exception as e:
            print(f"Error uploading {file} to {s3_bucket_name}/{key}: {e}")


def start_ingestion(knowledgebase_id, knowledgebase_datasource_id, region_name: str):
    client = boto3.client("bedrock-agent", region_name=region_name)
    response = client.start_ingestion_job(
        dataSourceId=knowledgebase_datasource_id,
        description="First Ingestion",
        knowledgeBaseId=knowledgebase_id,
    )
    return response


def check_ingestion_job_status(dataSourceId, ingestionJobId, knowledgeBaseId, region_name: str):
    client = boto3.client("bedrock-agent", region_name=region_name)
    while True:
        response = client.get_ingestion_job(
            dataSourceId=dataSourceId,
            ingestionJobId=ingestionJobId,
            knowledgeBaseId=knowledgeBaseId,
        )

        ingestion_job = response["ingestionJob"]
        status = ingestion_job["status"]

        if status in ["COMPLETE", "FAILED", "STOPPED"]:
            break

        print(f"Ingestion job status: {status} (Checking again in 30 seconds)")
        time.sleep(30)

    print(f"Final ingestion job status: {status}")

    if status == "COMPLETE":
        print("Ingestion job completed successfully.")
    elif status == "FAILED":
        print("Ingestion job failed.")
        print("Failure reasons:")
        for reason in ingestion_job["failureReasons"]:
            print(f"- {reason}")
    else:
        print("Ingestion job stopped.")


if __name__ == "__main__":
    # Add command line argument to specify the environment
    parser = argparse.ArgumentParser(description="Run ingestion process using Terraform outputs")
    parser.add_argument(
        "--env", 
        default="dev", 
        help="Environment to use (dev, prod, etc)."
    )
    parser.add_argument(
        "--region", default="us-east-1", help="AWS Region name (us-east-1, us-west-2, etc)."
    )
    args = parser.parse_args()
    
    # Get outputs from the specified environment
    outputs = get_terraform_outputs(args.env)

    knowledgebase_id = outputs["knowledge_base_id"]["value"]
    knowledgebase_datasource_id = outputs["data_source_id"]["value"]
    s3_bucket_name = outputs["resume_bucket_name"]["value"]

    upload_to_s3(s3_bucket_name, region_name=args.region)
    time.sleep(2)

    response = start_ingestion(knowledgebase_id, knowledgebase_datasource_id, region_name=args.region)

    ingestion_job_id = response["ingestionJob"]["ingestionJobId"]

    check_ingestion_job_status(
        knowledgebase_datasource_id, ingestion_job_id, knowledgebase_id, region_name=args.region
    )
