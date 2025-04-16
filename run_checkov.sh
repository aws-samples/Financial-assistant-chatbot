#!/bin/bash

# Check if Checkov is installed
if ! command -v checkov &> /dev/null; then
    echo "Checkov is not installed. Installing..."
    pip install checkov
fi

# Run Checkov on the project directory
echo "Running Checkov scan on the project directory..."
checkov -d . --framework terraform --output-file-path checkov_results.json --output json

# Check if the scan was successful
if [ $? -eq 0 ]; then
    echo "Checkov scan completed successfully. Results saved to checkov_results.json"
else
    echo "Checkov scan failed."
fi

# Display a summary of the results
echo "Summary of results:"
cat checkov_results.json | jq '.summary'
