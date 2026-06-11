#!/usr/bin/env node
/**
 * One-off migration: set status = 'draft' on all Invoice records where status = 'finalized'.
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/migrate-finalized-status.js --outputs-path amplify_outputs.json --confirm
 *
 * Auth (same pattern as import-prep.js):
 *   IMPORT_PREP_USERNAME=admin@example.com IMPORT_PREP_PASSWORD=secret node scripts/migrate-finalized-status.js ...
 */

import fs from 'node:fs';

export function collectFinalized(records) {
  return records.filter((r) => r.status === 'finalized');
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

  let totalScanned = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let nextToken = undefined;

  console.log(args.confirm ? 'Running migration...' : 'Dry run — pass --confirm to apply changes.');

  do {
    const { data, nextToken: next, errors } = await client.models.Invoice.list({
      filter: { status: { eq: 'finalized' } },
      limit: 100,
      nextToken,
    });

    if (errors?.length) {
      console.error('Error listing invoices:', errors);
      process.exitCode = 1;
      return;
    }

    nextToken = next;
    const finalized = collectFinalized(data || []);
    totalScanned += finalized.length;

    for (const invoice of finalized) {
      if (!args.confirm) {
        console.log(`  [dry-run] ${invoice.id} (${invoice.invoiceNumber}): finalized → draft`);
        continue;
      }
      const { errors: updateErrors } = await client.models.Invoice.update({
        id: invoice.id,
        status: 'draft',
      });
      if (updateErrors?.length) {
        console.error(`  FAILED ${invoice.id}:`, updateErrors);
        totalFailed += 1;
      } else {
        console.log(`  Updated ${invoice.id} (${invoice.invoiceNumber}): finalized → draft`);
        totalUpdated += 1;
      }
    }
  } while (nextToken);

  if (!args.confirm) {
    console.log(`\nDry run complete. ${totalScanned} finalized record(s) found. Re-run with --confirm to apply.`);
  } else {
    console.log(`\nMigration complete. Updated: ${totalUpdated}, Failed: ${totalFailed}`);
    if (totalFailed > 0) process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('migrate-finalized-status.js')) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
