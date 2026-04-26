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

  // Extract values from environment variables or backend outputs
  const userPoolId =
    process.env.AMPLIFY_COGNITO_USER_POOL_ID ||
    readPath(backendOutputs, ['auth.userPoolId', 'auth.user_pool_id']) ||
    readPath(existingOutputs, ['auth.user_pool_id']);
  const userPoolClientId =
    process.env.AMPLIFY_COGNITO_CLIENT_ID ||
    readPath(backendOutputs, ['auth.userPoolClientId', 'auth.user_pool_client_id']) ||
    readPath(existingOutputs, ['auth.user_pool_client_id']);
  const identityPoolId =
    process.env.AMPLIFY_IDENTITY_POOL_ID ||
    readPath(backendOutputs, ['auth.identityPoolId', 'auth.identity_pool_id']) ||
    readPath(existingOutputs, ['auth.identity_pool_id']);
  const region = process.env.AWS_REGION || 'ap-southeast-2';
  const graphqlUrl =
    process.env.AMPLIFY_GRAPHQL_ENDPOINT ||
    readPath(backendOutputs, ['data.url']) ||
    readPath(existingOutputs, ['data.url']);

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
      default_authorization_type: 'AWS_IAM',
      authorization_types: ['AMAZON_COGNITO_USER_POOLS'],
      model_introspection: {
        version: 1,
        models: {},
      },
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
