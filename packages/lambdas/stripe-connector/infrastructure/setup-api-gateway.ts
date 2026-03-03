import {
  APIGatewayClient,
  CreateRestApiCommand,
  GetRestApisCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  CreateDeploymentCommand,
  PutMethodResponseCommand,
  PutIntegrationResponseCommand,
} from '@aws-sdk/client-api-gateway';
import {
  LambdaClient,
  AddPermissionCommand,
  GetPolicyCommand,
} from '@aws-sdk/client-lambda';

/**
 * Finds existing API Gateway by name or creates a new one
 */
async function ensureRestApi(
  client: APIGatewayClient,
  apiName: string
): Promise<string> {
  const response = await client.send(new GetRestApisCommand({}));

  const existingApi = response.items?.find((api) => api.name === apiName);
  if (existingApi) {
    console.log(`API Gateway ${apiName} already exists: ${existingApi.id}`);
    return existingApi.id!;
  }

  const createResponse = await client.send(
    new CreateRestApiCommand({
      name: apiName,
      description: 'Stripe webhook endpoint for revenue signal detection',
      endpointConfiguration: { types: ['REGIONAL'] },
    })
  );

  console.log(`Created API Gateway: ${createResponse.id}`);
  return createResponse.id!;
}

/**
 * Creates the /webhook resource path
 */
async function createWebhookResource(
  client: APIGatewayClient,
  apiId: string
): Promise<string> {
  const resourcesResponse = await client.send(
    new GetResourcesCommand({ restApiId: apiId })
  );

  const rootResource = resourcesResponse.items?.find(
    (resource) => resource.path === '/'
  );
  if (!rootResource) {
    throw new Error('Root resource not found');
  }

  // Check if /webhook already exists
  const existingWebhook = resourcesResponse.items?.find(
    (resource) => resource.path === '/webhook'
  );
  if (existingWebhook) {
    console.log(`Resource /webhook already exists: ${existingWebhook.id}`);
    return existingWebhook.id!;
  }

  const createResourceResponse = await client.send(
    new CreateResourceCommand({
      restApiId: apiId,
      parentId: rootResource.id!,
      pathPart: 'webhook',
    })
  );

  console.log(`Created resource /webhook: ${createResourceResponse.id}`);
  return createResourceResponse.id!;
}

/**
 * Configures POST method on the webhook resource
 */
async function setupPostMethod(
  client: APIGatewayClient,
  apiId: string,
  resourceId: string,
  lambdaArn: string,
  region: string
): Promise<void> {
  // Create POST method
  await client.send(
    new PutMethodCommand({
      restApiId: apiId,
      resourceId: resourceId,
      httpMethod: 'POST',
      authorizationType: 'NONE',
    })
  );

  console.log('Created POST method on /webhook');

  // Configure Lambda integration
  await client.send(
    new PutIntegrationCommand({
      restApiId: apiId,
      resourceId: resourceId,
      httpMethod: 'POST',
      type: 'AWS_PROXY',
      integrationHttpMethod: 'POST',
      uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`,
    })
  );

  console.log('Configured Lambda integration');

  // Add method response
  await client.send(
    new PutMethodResponseCommand({
      restApiId: apiId,
      resourceId: resourceId,
      httpMethod: 'POST',
      statusCode: '200',
    })
  );

  // Add integration response
  await client.send(
    new PutIntegrationResponseCommand({
      restApiId: apiId,
      resourceId: resourceId,
      httpMethod: 'POST',
      statusCode: '200',
    })
  );
}

/**
 * Grants API Gateway permission to invoke the Lambda function
 */
async function grantApiGatewayPermission(
  lambdaClient: LambdaClient,
  functionName: string,
  apiId: string,
  region: string,
  accountId: string
): Promise<void> {
  const sourceArn = `arn:aws:execute-api:${region}:${accountId}:${apiId}/*/*/webhook`;

  try {
    // Check if permission already exists
    const policyResponse = await lambdaClient.send(
      new GetPolicyCommand({ FunctionName: functionName })
    );

    if (policyResponse.Policy?.includes(sourceArn)) {
      console.log('API Gateway permission already exists.');
      return;
    }
  } catch (error: any) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }
  }

  await lambdaClient.send(
    new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: `apigateway-invoke-${Date.now()}`,
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: sourceArn,
    })
  );

  console.log('Granted API Gateway permission to invoke Lambda.');
}

/**
 * Deploys the API to a stage
 */
async function deployApi(
  client: APIGatewayClient,
  apiId: string,
  stageName: string
): Promise<string> {
  await client.send(
    new CreateDeploymentCommand({
      restApiId: apiId,
      stageName: stageName,
      description: `Deployment to ${stageName} stage`,
    })
  );

  const endpoint = `https://${apiId}.execute-api.${process.env.AWS_REGION}.amazonaws.com/${stageName}/webhook`;
  console.log(`Deployed API to stage: ${stageName}`);
  console.log(`Webhook endpoint: ${endpoint}`);

  return endpoint;
}

/**
 * Main execution
 */
async function main() {
  const apiName = process.env.API_GATEWAY_NAME || 'stripe-webhook-api';
  const functionName = process.env.LAMBDA_FUNCTION_NAME || 'stripe-connector';
  const stageName = process.env.STAGE_NAME || 'prod';
  const region = process.env.AWS_REGION || 'us-east-1';
  const accountId = process.env.AWS_ACCOUNT_ID;

  if (!accountId) {
    throw new Error(
      'AWS_ACCOUNT_ID environment variable is required. Set it to your AWS account ID.'
    );
  }

  console.log(`Setting up API Gateway: ${apiName} in region: ${region}`);

  const apiClient = new APIGatewayClient({ region });
  const lambdaClient = new LambdaClient({ region });

  // Create or get API
  const apiId = await ensureRestApi(apiClient, apiName);

  // Create /webhook resource
  const resourceId = await createWebhookResource(apiClient, apiId);

  // Setup POST method with Lambda integration
  const lambdaArn = `arn:aws:lambda:${region}:${accountId}:function:${functionName}`;
  await setupPostMethod(apiClient, apiId, resourceId, lambdaArn, region);

  // Grant API Gateway permission to invoke Lambda
  await grantApiGatewayPermission(
    lambdaClient,
    functionName,
    apiId,
    region,
    accountId
  );

  // Deploy API
  const endpoint = await deployApi(apiClient, apiId, stageName);

  console.log('\nAPI Gateway setup complete!');
  console.log(`\nWebhook URL: ${endpoint}`);
  console.log('\nNext steps:');
  console.log('1. Copy the webhook URL above');
  console.log('2. Go to Stripe Dashboard > Developers > Webhooks');
  console.log('3. Add endpoint with this URL');
  console.log('4. Select events: customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed');
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
