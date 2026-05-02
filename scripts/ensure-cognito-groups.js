import { readFileSync } from 'node:fs';
import {
  CognitoIdentityProviderClient,
  GetGroupCommand,
  CreateGroupCommand,
  UpdateGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const outputsPath = process.env.AMPLIFY_OUTPUTS_PATH || 'amplify_outputs.json';

const REQUIRED_GROUPS = [
  { name: 'customer', precedence: 0 },
  { name: 'operator', precedence: 1 },
  { name: 'administrator', precedence: 2 },
];

function loadAmplifyOutputs(path) {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  const userPoolId = parsed?.auth?.user_pool_id;
  const region = parsed?.auth?.aws_region;

  if (!userPoolId || !region) {
    throw new Error(`Missing auth.user_pool_id or auth.aws_region in ${path}`);
  }

  return { userPoolId, region };
}

async function ensureGroup(client, userPoolId, group) {
  try {
    const existing = await client.send(
      new GetGroupCommand({
        UserPoolId: userPoolId,
        GroupName: group.name,
      })
    );

    if (existing?.Group?.Precedence !== group.precedence) {
      await client.send(
        new UpdateGroupCommand({
          UserPoolId: userPoolId,
          GroupName: group.name,
          Precedence: group.precedence,
        })
      );
      console.log(`Updated group '${group.name}' precedence to ${group.precedence}`);
    } else {
      console.log(`Group '${group.name}' already exists`);
    }
  } catch (error) {
    const code = error?.name || error?.Code;
    if (code === 'ResourceNotFoundException') {
      await client.send(
        new CreateGroupCommand({
          UserPoolId: userPoolId,
          GroupName: group.name,
          Precedence: group.precedence,
        })
      );
      console.log(`Created group '${group.name}'`);
      return;
    }
    throw error;
  }
}

async function main() {
  const { userPoolId, region } = loadAmplifyOutputs(outputsPath);
  const client = new CognitoIdentityProviderClient({ region });

  for (const group of REQUIRED_GROUPS) {
    await ensureGroup(client, userPoolId, group);
  }
}

main().catch((error) => {
  console.error('Failed to ensure Cognito groups:', error);
  process.exitCode = 1;
});
