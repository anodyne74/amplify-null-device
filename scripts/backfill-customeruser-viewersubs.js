#!/usr/bin/env node
/**
 * One-off backfill: stamp CustomerUser.viewerSubs on every existing CustomerUser
 * row, so read_only customer users (not just the account owner) can read the
 * whole team directory for their customer -- the same viewerSubs convention
 * already used for Customer/Route/Stop/Invoice/LineItem/PaymentRecord.
 *
 * New CustomerUser rows are kept in sync going forward by
 * customer-access-activation's Lambda handler and lib/queries.ts's
 * syncViewerSubsForCustomer -- this script only backfills rows that predate
 * that change. Idempotent -- safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-customeruser-viewersubs.js --outputs-path amplify_outputs.json --confirm
 *
 * Auth (same pattern as import-prep.js / migrate-finalized-status.js):
 *   IMPORT_PREP_USERNAME=admin@example.com IMPORT_PREP_PASSWORD=secret node scripts/backfill-customeruser-viewersubs.js ...
 */

import fs from 'node:fs';

const PENDING_SUB_PREFIX = 'pending:';

export function computeViewerSubs(customerUsers) {
  return [
    ...new Set(
      (customerUsers || [])
        .map((row) => row.userSub?.trim())
        .filter((value) => Boolean(value) && !value.startsWith(PENDING_SUB_PREFIX))
    ),
  ];
}

function parseArgs(argv) {
  const args = { outputsPath: 'amplify_outputs.json', confirm: false, username: '', password: '' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--outputs-path' && argv[i + 1]) { args.outputsPath = argv[i += 1]; continue; }
    if (argv[i] === '--confirm') { args.confirm = true; continue; }
    if (argv[i] === '--username' && argv[i + 1]) { args.username = argv[i += 1]; continue; }
    if (argv[i] === '--password' && argv[i + 1]) { args.password = argv[i += 1]; continue; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  const { Amplify } = await import('aws-amplify');
  const { generateClient } = await import('aws-amplify/data');
  const { signIn, fetchAuthSession } = await import('aws-amplify/auth');

  const outputs = JSON.parse(fs.readFileSync(args.outputsPath, 'utf8'));
  Amplify.configure(outputs);

  const username = args.username || process.env.IMPORT_PREP_USERNAME;
  const password = args.password || process.env.IMPORT_PREP_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'Set IMPORT_PREP_USERNAME and IMPORT_PREP_PASSWORD or pass --username/--password.'
    );
  }

  await signIn({ username, password });
  const session = await fetchAuthSession();
  if (!session.tokens?.idToken) throw new Error('Sign-in succeeded but no token available.');

  const client = generateClient();

  let totalCustomers = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let nextToken;

  console.log(args.confirm ? 'Running backfill...' : 'Dry run — pass --confirm to apply changes.');

  do {
    const { data: customers, nextToken: next, errors } = await client.models.Customer.list({
      limit: 100,
      nextToken,
    });

    if (errors?.length) {
      console.error('Error listing customers:', errors);
      process.exitCode = 1;
      return;
    }

    nextToken = next;

    for (const customer of customers || []) {
      totalCustomers += 1;

      const { data: customerUsers, errors: customerUserErrors } = await client.models.CustomerUser.list({
        filter: { customerId: { eq: customer.id } },
        limit: 1000,
      });

      if (customerUserErrors?.length) {
        console.error(`  Error listing CustomerUsers for ${customer.id}:`, customerUserErrors);
        totalFailed += 1;
        continue;
      }

      const viewerSubs = computeViewerSubs(customerUsers);

      for (const customerUser of customerUsers || []) {
        if (!args.confirm) {
          console.log(`  [dry-run] ${customer.name} / ${customerUser.id}: viewerSubs -> [${viewerSubs.join(', ')}]`);
          continue;
        }
        const { errors: updateErrors } = await client.models.CustomerUser.update({
          id: customerUser.id,
          viewerSubs,
        });
        if (updateErrors?.length) {
          console.error(`  FAILED ${customerUser.id}:`, updateErrors);
          totalFailed += 1;
        } else {
          console.log(`  Updated ${customer.name} / ${customerUser.id}`);
          totalUpdated += 1;
        }
      }
    }
  } while (nextToken);

  if (!args.confirm) {
    console.log(`\nDry run complete. ${totalCustomers} customer(s) scanned. Re-run with --confirm to apply.`);
  } else {
    console.log(`\nBackfill complete. Customers scanned: ${totalCustomers}, updated: ${totalUpdated}, failed: ${totalFailed}`);
    if (totalFailed > 0) process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('backfill-customeruser-viewersubs.js')) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
