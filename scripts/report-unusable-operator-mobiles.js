#!/usr/bin/env node
/**
 * Report-only: list Operators whose stored mobile isn't an Australian mobile,
 * so Notify Operator can't text them (#424). An administrator fixes each one
 * by hand on the Drivers screen, which now only saves usable mobiles.
 * Operators with no mobile aren't listed: that's allowed. Writes nothing.
 *
 * Usage:
 *   node scripts/report-unusable-operator-mobiles.js --outputs-path amplify_outputs.json
 *
 * Auth (same pattern as import-prep.js):
 *   IMPORT_PREP_USERNAME=admin@example.com IMPORT_PREP_PASSWORD=secret node scripts/report-unusable-operator-mobiles.js ...
 */

import fs from 'node:fs';

/** Mirrors australianMobile() in lib/operatorMobile.ts — keep the two in step. */
export function isAustralianMobile(raw) {
  if (!raw) return false;
  return /^(?:\+?61|0)(4\d{8})$/.test(raw.replace(/[\s().-]/g, ''));
}

export function findUnusableMobiles(operators) {
  return operators
    .filter((operator) => operator.phone && operator.phone.trim() && !isAustralianMobile(operator.phone))
    .map((operator) => ({
      id: operator.id,
      name: operator.name ?? null,
      email: operator.email ?? null,
      phone: operator.phone,
    }));
}

function parseArgs(argv) {
  const args = { outputsPath: 'amplify_outputs.json', username: '', password: '' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--outputs-path' && argv[i + 1]) { args.outputsPath = argv[i += 1]; continue; }
    if (argv[i] === '--username' && argv[i + 1]) { args.username = argv[i += 1]; continue; }
    if (argv[i] === '--password' && argv[i + 1]) { args.password = argv[i += 1]; continue; }
  }
  return args;
}

async function listAll(model, options) {
  const items = [];
  let nextToken;
  do {
    const { data, nextToken: next, errors } = await model.list({ ...options, limit: 100, nextToken });
    if (errors?.length) throw new Error(`List failed: ${JSON.stringify(errors)}`);
    items.push(...(data || []));
    nextToken = next;
  } while (nextToken);
  return items;
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

  const operators = await listAll(client.models.Operator, { selectionSet: ['id', 'name', 'email', 'phone'] });
  const unusable = findUnusableMobiles(operators);
  for (const o of unusable) {
    console.log(`  ${o.name ?? o.id} <${o.email ?? 'no email'}> (${o.id}): "${o.phone}"`);
  }
  console.log(`\n${operators.length} Operator(s) scanned, ${unusable.length} with a number that isn't an Australian mobile.`);
}

if (process.argv[1]?.endsWith('report-unusable-operator-mobiles.js')) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
