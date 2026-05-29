#!/usr/bin/env node
/**
 * Generate amplify_outputs.json from Amplify backend stack outputs
 * This script reads the CloudFormation outputs from the Amplify backend environment
 * and generates the client-side amplify_outputs.json configuration file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readPath = (obj, paths) => {
  for (const entry of paths) {
    const value = entry.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
};

// Try to read backend outputs from Amplify environment
const getBackendOutputs = () => {
  // In Amplify Console, the backend outputs are available via environment
  // or via a generated file during backend build
  
  // Look for backend outputs in common locations
  const possiblePaths = [
    path.join(process.cwd(), 'amplify', 'outputs.json'),
    path.join(process.cwd(), '.amplify', 'outputs.json'),
    path.join(process.cwd(), 'amplify_outputs.json'),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`Failed to parse ${filePath}:`, error.message);
      }
    }
  }

  return null;
};

const getExistingOutputs = () => {
  const outputPath = path.join(process.cwd(), 'amplify_outputs.json');
  if (!fs.existsSync(outputPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  } catch (error) {
    console.warn(`Failed to parse existing amplify_outputs.json: ${error.message}`);
    return null;
  }
};

// Build amplify_outputs.json from environment or backend outputs
const generateAmplifyOutputs = () => {
  const backendOutputs = getBackendOutputs();
  const existingOutputs = getExistingOutputs();
  const isAmplifyHostedContext = Boolean(process.env.AWS_BRANCH || process.env.AWS_APP_ID || process.env.AMPLIFY_ENVIRONMENT_NAME);
  const allowExistingOutputsFallback = !isAmplifyHostedContext;

  const authFromBackend = {
    userPoolId: readPath(backendOutputs, ['auth.userPoolId', 'auth.user_pool_id']),
    userPoolClientId: readPath(backendOutputs, ['auth.userPoolClientId', 'auth.user_pool_client_id']),
    identityPoolId: readPath(backendOutputs, ['auth.identityPoolId', 'auth.identity_pool_id']),
    region: readPath(backendOutputs, ['auth.region', 'auth.aws_region', 'data.aws_region']),
  };

  const authFromEnv = {
    userPoolId:
      process.env.NEXT_PUBLIC_AMPLIFY_COGNITO_USER_POOL_ID ||
      process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ||
      process.env.AMPLIFY_COGNITO_USER_POOL_ID,
    userPoolClientId:
      process.env.NEXT_PUBLIC_AMPLIFY_COGNITO_CLIENT_ID ||
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ||
      process.env.AMPLIFY_COGNITO_CLIENT_ID,
    identityPoolId:
      process.env.NEXT_PUBLIC_AMPLIFY_IDENTITY_POOL_ID ||
      process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID ||
      process.env.AMPLIFY_IDENTITY_POOL_ID,
    region:
      process.env.NEXT_PUBLIC_AWS_REGION ||
      process.env.NEXT_PUBLIC_COGNITO_REGION ||
      process.env.NEXT_PUBLIC_API_REGION ||
      process.env.AWS_REGION,
  };

  // Extract values from environment variables or backend outputs
  const userPoolId =
    (isAmplifyHostedContext ? authFromBackend.userPoolId || authFromEnv.userPoolId : authFromEnv.userPoolId || authFromBackend.userPoolId) ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['auth.user_pool_id']) : undefined);
  const userPoolClientId =
    (isAmplifyHostedContext
      ? authFromBackend.userPoolClientId || authFromEnv.userPoolClientId
      : authFromEnv.userPoolClientId || authFromBackend.userPoolClientId) ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['auth.user_pool_client_id']) : undefined);
  const identityPoolId =
    (isAmplifyHostedContext
      ? authFromBackend.identityPoolId || authFromEnv.identityPoolId
      : authFromEnv.identityPoolId || authFromBackend.identityPoolId) ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['auth.identity_pool_id']) : undefined);
  const region =
    authFromBackend.region ||
    authFromEnv.region ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['auth.aws_region', 'data.aws_region']) : undefined) ||
    'ap-southeast-2';
  const graphqlUrl =
    process.env.AMPLIFY_GRAPHQL_ENDPOINT ||
    readPath(backendOutputs, ['data.url']) ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['data.url']) : undefined);
  const defaultAuthorizationType =
    readPath(backendOutputs, ['data.default_authorization_type']) ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['data.default_authorization_type']) : undefined) ||
    'AWS_IAM';
  const authorizationTypes =
    readPath(backendOutputs, ['data.authorization_types']) ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['data.authorization_types']) : undefined) ||
    ['AMAZON_COGNITO_USER_POOLS'];
  const modelIntrospection =
    readPath(backendOutputs, ['data.model_introspection']) ||
    (allowExistingOutputsFallback ? readPath(existingOutputs, ['data.model_introspection']) : undefined) ||
    {
      version: 1,
      models: {},
    };

  // If we have real values, use them; otherwise use placeholders
  const outputs = {
    auth: {
      user_pool_id: userPoolId || 'PLACEHOLDER_USER_POOL_ID',
      aws_region: region,
      user_pool_client_id: userPoolClientId || 'PLACEHOLDER_CLIENT_ID',
      identity_pool_id: identityPoolId || `${region}:PLACEHOLDER_IDENTITY_ID`,
      mfa_methods: [],
      standard_required_attributes: ['email'],
      username_attributes: ['email'],
      user_verification_types: ['email'],
      groups: [],
      mfa_configuration: 'NONE',
      password_policy: {
        min_length: 8,
        require_lowercase: true,
        require_numbers: true,
        require_symbols: true,
        require_uppercase: true,
      },
      unauthenticated_identities_enabled: true,
    },
    data: {
      url: graphqlUrl || `https://PLACEHOLDER.appsync-api.${region}.amazonaws.com/graphql`,
      aws_region: region,
      default_authorization_type: defaultAuthorizationType,
      authorization_types: authorizationTypes,
      model_introspection: modelIntrospection,
    },
  };

  return outputs;
};

// Main execution
const main = () => {
  try {
    const outputs = generateAmplifyOutputs();
    const outputPath = path.join(process.cwd(), 'amplify_outputs.json');

    fs.writeFileSync(outputPath, JSON.stringify(outputs, null, 2));

    const hasRealValues =
      !outputs.auth.user_pool_id.includes('PLACEHOLDER') &&
      !outputs.auth.user_pool_client_id.includes('PLACEHOLDER');

    if (hasRealValues) {
      console.log('✓ Generated amplify_outputs.json with real Amplify backend values');
    } else {
      console.log('✓ Generated amplify_outputs.json with placeholder values');
      console.log('  Note: Set AMPLIFY_COGNITO_USER_POOL_ID, AMPLIFY_COGNITO_CLIENT_ID,');
      console.log('  and AMPLIFY_IDENTITY_POOL_ID environment variables to use real values.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error generating amplify_outputs.json:', error);
    process.exit(1);
  }
};

main();
