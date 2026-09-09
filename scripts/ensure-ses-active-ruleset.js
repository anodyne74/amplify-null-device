import { readFileSync } from 'node:fs';
import {
  SESClient,
  DescribeActiveReceiptRuleSetCommand,
  SetActiveReceiptRuleSetCommand,
} from '@aws-sdk/client-ses';

const outputsPath = process.env.AMPLIFY_OUTPUTS_PATH || 'amplify_outputs.json';

// SES only ever delivers inbound mail through whichever ONE receipt rule set is
// marked "active" for the account/region -- CloudFormation creates a rule set
// per branch (amplify/backend.ts) but never designates it active. Without this
// script, a branch's rules just sit inert: whatever rule set happened to be
// active last (possibly from a branch that no longer exists, or an empty one)
// keeps silently swallowing mail with a "550 5.1.1 mailbox unavailable" bounce,
// regardless of what the current branch's own rules say. See the
// SesReceiptRuleSet comment in amplify/backend.ts for the full story.
export function loadRuleSetName(path) {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  const ruleSetName = parsed?.custom?.sesInboundRuleSetName;
  const region = parsed?.auth?.aws_region;

  if (!ruleSetName || !region) {
    throw new Error(`Missing custom.sesInboundRuleSetName or auth.aws_region in ${path}`);
  }

  return { ruleSetName, region };
}

export async function ensureActive(client, ruleSetName) {
  const active = await client.send(new DescribeActiveReceiptRuleSetCommand({}));

  if (active?.Metadata?.Name === ruleSetName) {
    console.log(`SES receipt rule set '${ruleSetName}' is already active`);
    return;
  }

  await client.send(new SetActiveReceiptRuleSetCommand({ RuleSetName: ruleSetName }));
  console.log(
    `Activated SES receipt rule set '${ruleSetName}'` +
      (active?.Metadata?.Name ? ` (was '${active.Metadata.Name}')` : ' (none was active)'),
  );
}

async function main() {
  const { ruleSetName, region } = loadRuleSetName(outputsPath);
  const client = new SESClient({ region });
  await ensureActive(client, ruleSetName);
}

if (process.argv[1]?.endsWith('ensure-ses-active-ruleset.js')) {
  main().catch((error) => {
    const code = error?.name || error?.Code || error?.__type;
    const isAccessDenied =
      code === 'AccessDeniedException' ||
      (typeof error?.message === 'string' && error.message.includes('not authorized to perform: ses:'));

    if (isAccessDenied) {
      // Amplify Hosting build roles often do not include SES admin permissions.
      // Don't fail deployment in that case: inbound mail still needs a human to
      // activate the rule set once, same as any other IAM gap this build hits.
      console.warn('Skipping SES active rule set ensure due to IAM permissions:', error.message || code);
      process.exitCode = 0;
      return;
    }

    console.error('Failed to ensure SES active receipt rule set:', error);
    process.exitCode = 1;
  });
}
