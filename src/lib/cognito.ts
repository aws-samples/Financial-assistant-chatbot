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
  Duration,
  aws_iam as iam,
  aws_cognito as cognito,
  CfnOutput,
  Stack,
} from "aws-cdk-lib";

import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { FunctionUrl } from "aws-cdk-lib/aws-lambda";

interface CognitoProps {
  lambdaUrl: FunctionUrl;
}

export default class CognitoResources extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly identityPoolRoleAttachment: cognito.CfnIdentityPoolRoleAttachment;

  constructor(scope: Construct, id: string, props: CognitoProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, "WebAppUserPool", {
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      featurePlan: cognito.FeaturePlan.PLUS,
    });

    this.userPoolClient = new cognito.UserPoolClient(
      this,
      "WebAppUserPoolClient",
      {
        userPool: this.userPool,
        authFlows: {
          userPassword: true,
          userSrp: true,
          adminUserPassword: true,
          custom: true,
        },
      }
    );

    this.identityPool = new cognito.CfnIdentityPool(
      this,
      "WebAppIdentityPool",
      {
        allowUnauthenticatedIdentities: false,
        cognitoIdentityProviders: [
          {
            clientId: this.userPoolClient.userPoolClientId,
            providerName: this.userPool.userPoolProviderName,
          },
        ],
      }
    );

    const authUserRole = new iam.Role(this, "AuthenticatedUserRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    const allowLambdaAccessPolicy = new iam.Policy(
      this,
      "AllowLambdaAccessPolicy",
      {
        policyName: "AllowLambdaAccessPolicy",
        statements: [
          new iam.PolicyStatement({
            actions: ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"],
            resources: [props.lambdaUrl.functionArn],
          }),
        ],
      }
    );
    authUserRole.attachInlinePolicy(allowLambdaAccessPolicy);

    props.lambdaUrl.grantInvokeUrl(authUserRole);

    const unauthUserRole = new iam.Role(this, "UnauthenticatedUserRole", {
      assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
        StringEquals: {
          "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "unauthenticated",
        },
      }),
    });

    this.identityPoolRoleAttachment = new cognito.CfnIdentityPoolRoleAttachment(
      this,
      "IdentityPoolRoleAttachment",
      {
        identityPoolId: this.identityPool.ref,
        roles: {
          authenticated: authUserRole.roleArn,
          unauthenticated: unauthUserRole.roleArn,
        },
        roleMappings: {
          mapping: {
            type: "Token",
            ambiguousRoleResolution: "AuthenticatedRole",
            identityProvider: `cognito-idp.${
              Stack.of(this).region
            }.amazonaws.com/${this.userPool.userPoolId}:${
              this.userPoolClient.userPoolClientId
            }`,
          },
        },
      }
    );

    new CfnOutput(this, "UserPoolIdOutput", {
      value: this.userPool.userPoolId,
      exportName: "Backend-CognitoUserPoolId",
    });

    new CfnOutput(this, "UserPoolClientIdOutput", {
      value: this.userPoolClient.userPoolClientId,
      exportName: "Backend-CognitoUserPoolClientId",
    });

    new CfnOutput(this, "IdentityPoolIdOutput", {
      value: this.identityPool.ref,
      exportName: "Backend-CognitoIdentityPoolId",
    });

    NagSuppressions.addResourceSuppressions(this.userPool, [
      {
        id: "AwsSolutions-COG2",
        reason: "MFA not required for Cognito during prototype engagement",
      },
      {
        id: 'AwsSolutions-COG3',
        reason:
          'Advanced Security Features is deprecated in favor of the Plus feature plan.',
      }
    ]);

    NagSuppressions.addResourceSuppressions(allowLambdaAccessPolicy, [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "This lambda should be able to GetMedia for any stream ARN in this account.",
      },
    ]);
  }
}
