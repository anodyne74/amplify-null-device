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
const requireRealOutputs = forceRealOutputs || (isCi && isAmplifyHostedContext);

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

if (requireRealOutputs && hasPlaceholders) {
  console.error('❌ amplify_outputs.json contains placeholder values in a deployed CI context.');
  console.error('Set real values via Amplify environment variables or backend outputs.');
  console.error('Placeholder fields found at:');
  placeholderPaths.forEach((placeholderPath) => {
    console.error(`  - ${placeholderPath}`);
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
