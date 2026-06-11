#!/usr/bin/env node
/**
 * Validate amplify_outputs.json and enforce placeholder policy.
 *
 * Policy:
 * - Local/dev contexts may use placeholder values.
 * - CI deployed contexts must not contain PLACEHOLDER values.
 */

import fs from 'fs';
import path from 'path';

const outputPath = path.join(process.cwd(), 'amplify_outputs.json');

const isObject = (value) => value !== null && typeof value === 'object';

const collectPlaceholderPaths = (value, currentPath = '', results = []) => {
  if (typeof value === 'string' && value.includes('PLACEHOLDER')) {
    results.push(currentPath || '<root>');
    return results;
  }

  if (!isObject(value)) {
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectPlaceholderPaths(item, `${currentPath}[${index}]`, results);
    });
    return results;
  }

  Object.entries(value).forEach(([key, nested]) => {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    collectPlaceholderPaths(nested, nextPath, results);
  });

  return results;
};

const isCi = process.env.CI === 'true';
const hasAmplifyBranch = Boolean(process.env.AWS_BRANCH);
const hasAmplifyAppId = Boolean(process.env.AWS_APP_ID);
const hasAmplifyEnv = Boolean(process.env.AMPLIFY_ENVIRONMENT_NAME);
const forceRealOutputs = process.env.AMPLIFY_FORCE_REAL_OUTPUTS === 'true';
const isAmplifyHostedContext = hasAmplifyBranch || hasAmplifyAppId || hasAmplifyEnv;
// Amplify-hosted builds must always ship real backend outputs.
// Relying on CI=true is brittle because some hosted contexts may not set it.
const requireRealOutputs = forceRealOutputs || isAmplifyHostedContext || isCi;

if (!fs.existsSync(outputPath)) {
  console.error('❌ Missing amplify_outputs.json');
  process.exit(1);
}

let outputs;
try {
  outputs = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
} catch (error) {
  console.error(`❌ Failed to parse amplify_outputs.json: ${error.message}`);
  process.exit(1);
}

const placeholderPaths = collectPlaceholderPaths(outputs);
const hasPlaceholders = placeholderPaths.length > 0;

const readFirstDefinedEnv = (keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return null;
};

const AUTH_ENV_ALIASES = {
  userPoolId: [
    'NEXT_PUBLIC_AMPLIFY_COGNITO_USER_POOL_ID',
    'NEXT_PUBLIC_COGNITO_USER_POOL_ID',
    'AMPLIFY_COGNITO_USER_POOL_ID',
  ],
  userPoolClientId: [
    'NEXT_PUBLIC_AMPLIFY_COGNITO_CLIENT_ID',
    'NEXT_PUBLIC_COGNITO_CLIENT_ID',
    'AMPLIFY_COGNITO_CLIENT_ID',
  ],
  identityPoolId: [
    'NEXT_PUBLIC_AMPLIFY_IDENTITY_POOL_ID',
    'NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID',
    'AMPLIFY_IDENTITY_POOL_ID',
  ],
  awsRegion: [
    'NEXT_PUBLIC_AWS_REGION',
    'NEXT_PUBLIC_COGNITO_REGION',
    'NEXT_PUBLIC_API_REGION',
    'AWS_REGION',
  ],
};

const ENV_TO_OUTPUT_KEY = {
  userPoolId: 'user_pool_id',
  userPoolClientId: 'user_pool_client_id',
  identityPoolId: 'identity_pool_id',
  awsRegion: 'aws_region',
};

const auth = (isObject(outputs) ? outputs.auth : null) || {};
const envToOutputChecks = Object.entries(ENV_TO_OUTPUT_KEY).map(([aliasKey, outputKey]) => ({
  outputKey,
  envKeys: AUTH_ENV_ALIASES[aliasKey],
}));

const envMismatches = envToOutputChecks
  .map((check) => {
    const envValue = readFirstDefinedEnv(check.envKeys);
    const outputValue = typeof auth[check.outputKey] === 'string' ? auth[check.outputKey].trim() : '';

    if (!envValue || !outputValue || outputValue.includes('PLACEHOLDER')) {
      return null;
    }

    if (envValue.value === outputValue) {
      return null;
    }

    return {
      outputKey: check.outputKey,
      envKey: envValue.key,
      envValue: envValue.value,
      outputValue,
    };
  })
  .filter(Boolean);

if (requireRealOutputs && hasPlaceholders) {
  console.error('❌ amplify_outputs.json contains placeholder values in a deployed CI context.');
  console.error('Set real values via Amplify environment variables or backend outputs.');
  console.error('Placeholder fields found at:');
  placeholderPaths.forEach((placeholderPath) => {
    console.error(`  - ${placeholderPath}`);
  });
  process.exit(1);
}

if (isAmplifyHostedContext && envMismatches.length > 0) {
  console.error('❌ Amplify auth environment variable mismatch detected.');
  console.error('The generated amplify_outputs.json does not match one or more configured env overrides.');
  console.error('This usually means stale Cognito IDs are set in Amplify Console environment variables.');
  console.error('Mismatches:');
  envMismatches.forEach((mismatch) => {
    console.error(
      `  - ${mismatch.outputKey}: env ${mismatch.envKey}="${mismatch.envValue}" != outputs "${mismatch.outputValue}"`
    );
  });
  process.exit(1);
}

if (hasPlaceholders) {
  console.warn('⚠ amplify_outputs.json contains placeholder values (allowed in local/non-deployed context).');
  placeholderPaths.forEach((placeholderPath) => {
    console.warn(`  - ${placeholderPath}`);
  });
} else {
  console.log('✓ amplify_outputs.json validation passed with real values.');
}
