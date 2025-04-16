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

    print(f"""
VITE_API_GATEWAY_REST_API_ENDPOINT=""
VITE_API_FUNCTION_ARN="{outputs['lambda_function_arn']['value']}"
VITE_AWS_REGION="{args.region}"
VITE_COGNITO_USER_POOL_ID="{outputs['cognito_user_pool_id']['value']}"
VITE_COGNITO_USER_POOL_CLIENT_ID="{outputs['cognito_user_pool_client_id']['value']}"
VITE_COGNITO_IDENTITY_POOL_ID="{outputs['cognito_identity_pool_id']['value']}"
VITE_API_NAME="RestAPI"
VITE_APP_LOGO_URL=""
VITE_APP_NAME="Financial Assistant powered by GenAI"
""")
