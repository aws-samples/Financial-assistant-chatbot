// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Permission is hereby granted, free of charge, to any person obtaining a copy of this
// software and associated documentation files (the "Software"), to deal in the Software
// without restriction, including without limitation the rights to use, copy, modify,
// merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import {
  Stack,
  StackProps,
  RemovalPolicy,
  CfnOutput,
  aws_dynamodb as ddb,
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_iam as iam,
  Duration,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Cors } from "aws-cdk-lib/aws-apigateway";
import { NagSuppressions } from "cdk-nag";
import CognitoResources from "./cognito";
import { getParsingPromptTemplate } from "./prompts.ts";
import { bedrock } from "@cdklabs/generative-ai-cdk-constructs";

const path = require("node:path");

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const chatHistoryTable = new ddb.Table(this, "ChatHistoryTable", {
      partitionKey: { name: "id", type: ddb.AttributeType.STRING },
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      encryption: ddb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY, // TODO: change to RETAIN when moving to production
    });

    const archiveBucket = new s3.Bucket(
      this,
      "FinancialDocumentsArchiveBucket",
      {
        removalPolicy: RemovalPolicy.DESTROY, // TODO: change to RETAIN when moving to production
        encryption: s3.BucketEncryption.KMS_MANAGED,
        autoDeleteObjects: true, // TODO: remove when moving to production
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        versioned: true,
      }
    );

    const archiveKnowledgeBase = new bedrock.KnowledgeBase(this, "KnowledgeBase", {
      name: "FinancialDocumentsKnowledgeBase",
      embeddingsModel: bedrock.BedrockFoundationModel.COHERE_EMBED_MULTILINGUAL_V3,
    });

    const archiveBucketDataSource = new bedrock.S3DataSource(this, "DataSource", {
      bucket: archiveBucket,
      knowledgeBase: archiveKnowledgeBase,
      dataSourceName: "rag-data-source",
      chunkingStrategy: bedrock.ChunkingStrategy.SEMANTIC,
      parsingStrategy: bedrock.ParsingStategy.foundationModel({
        parsingModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_SONNET_V1_0.asIModel(this),
        parsingPrompt: getParsingPromptTemplate()
      }),
    });

    const botChainFunction = new lambda.Function(this, "BotChain", {
      code: lambda.Code.fromAsset(path.join(__dirname, "lambda"), {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: [
            "bash",
            "-c",
            "npm install && cp -rT /asset-input/ /asset-output/",
          ],
          user: "root",
        },
      }),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.minutes(5),
      memorySize: 512,
      loggingFormat: lambda.LoggingFormat.JSON,
      systemLogLevelV2: lambda.SystemLogLevel.INFO,
      applicationLogLevelV2: lambda.ApplicationLogLevel.DEBUG, // TODO: change to INFO when moving to production
      environment: {
        DYNAMODB_HISTORY_TABLE_NAME: chatHistoryTable.tableName,
        NUMBER_OF_RESULTS: "15",
        NUMBER_OF_CHAT_INTERACTIONS_TO_REMEMBER: "10",
        SELF_QUERY_MODEL_ID: "anthropic.claude-3-haiku-20240307-v1:0",
        CONDENSE_MODEL_ID: "anthropic.claude-3-haiku-20240307-v1:0",
        CHAT_MODEL_ID: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        LANGUAGE: "english",
        LANGCHAIN_VERBOSE: "false",
        KNOWLEDGE_BASE_ID: archiveKnowledgeBase.knowledgeBaseId,
        SEARCH_TYPE: "HYBRID"
      },
    });
    chatHistoryTable.grantReadWriteData(botChainFunction);
    botChainFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          Stack.of(this).formatArn({
            account: "",
            service: "bedrock",
            resource: "foundation-model",
            resourceName: "anthropic.claude-3-haiku-20240307-v1:0",
          }),
          Stack.of(this).formatArn({
            account: "",
            service: "bedrock",
            resource: "foundation-model",
            resourceName: "anthropic.claude-3-5-sonnet-20240620-v1:0",
          })
        ],
      })
    );
    botChainFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:Retrieve"
        ],
        resources: [
          Stack.of(this).formatArn({
            service: "bedrock",
            resource: "knowledge-base",
            resourceName: "*",
          }),
        ],
      })
    );
    botChainFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["kms:Decrypt"],
        resources: [
          Stack.of(this).formatArn({
            service: "kms",
            resource: "alias",
            resourceName: "aws/ssm",
          }),
        ],
      })
    );

    const fnUrl = botChainFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowCredentials: true,
        allowedHeaders: [
          ...Cors.DEFAULT_HEADERS,
          "Access-Control-Allow-Origin",
        ],
        // allowedMethods: [lambda.HttpMethod.OPTIONS, lambda.HttpMethod.POST],
        allowedOrigins: Cors.ALL_ORIGINS, // TODO: change to amplify domain
      },
    });

    const cognitoResources = new CognitoResources(this, "CognitoResources", {
      lambdaUrl: fnUrl,
    });

    new CfnOutput(this, "RestApiEndpoint", {
      value: fnUrl.url,
      exportName: "Backend-RestApiEndpoint",
    });
    new CfnOutput(this, "LambdaFunctionArn", {
      value: botChainFunction.functionArn,
      exportName: "Backend-LambdaFunctionArn",
    });
    new CfnOutput(this, "KnowledgeBaseId", {
      value: archiveKnowledgeBase.knowledgeBaseId,
    });

    new CfnOutput(this, "ResumeBucketName", {
      value: archiveBucket.bucketName,
    });

    new CfnOutput(this, "DataSourceId", {
      value: archiveBucketDataSource.dataSourceId,
    });

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      "/BackendStack/OpenSearchIndexCRProvider/CustomResourcesFunction/Resource",
      [
        {
          id: "AwsSolutions-L1",
          reason: "The internal lambda resource for the opensearch custom provider in the KB has a non-latest lambda version",
        }
      ],
      true,
    )

    NagSuppressions.addResourceSuppressions(botChainFunction.role!, [
      {
        id: "AwsSolutions-IAM4",
        reason: "This lambda uses AWSLambdaBasicExecutionRole managed policy",
        appliesTo: [
          "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        ],
      },
    ]);

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Lambda function uses AWS managed policy for basic execution role, which is acceptable for this use case.',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Lambda function requires these permissions for log retention, which is a managed service and acess to knowledge-bases.',
        appliesTo: [
          'Action::logs:DeleteRetentionPolicy',
          'Action::logs:PutRetentionPolicy',
          'Resource::arn:<AWS::Partition>:bedrock:<AWS::Region>:<AWS::AccountId>:knowledge-base/*',
          'Resource::*',
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressions(archiveBucket, [
      {
        id: "AwsSolutions-S1",
        reason:
          "For prototyping purposes we chose not to log access to bucket. You should consider logging as you move to production.",
      },
    ]);
  }
}
