#!/usr/bin/env node
/**
 * Report-only: list Routes whose stored Billed Time total (overrideDurationMinutes)
 * no longer matches the sum of their four billed phases. lib/billedTime.ts reads
 * these Routes as total-only (the total wins), so each one is decided by hand.
 * Writes nothing.
 *
 * Usage:
 *   node scripts/report-billed-time-mismatches.js --outputs-path amplify_outputs.json
 *
 * Auth (same pattern as import-prep.js):
 *   IMPORT_PREP_USERNAME=admin@example.com IMPORT_PREP_PASSWORD=secret node scripts/report-billed-time-mismatches.js ...
 */

import fs from 'node:fs';

const PHASE_FIELDS = ['billedLoadMinutes', 'billedPlacementMinutes', 'billedPickupMinutes', 'billedUnloadMinutes'];

const isNumber = (value) => typeof value === 'number';

/** Mirrors the total-only rule in lib/billedTime.ts — keep the two in step. */
export function findBilledTimeMismatches(routes, invoicedRouteIds = new Set()) {
  return routes.flatMap((route) => {
    const total = route.overrideDurationMinutes;
    if (!isNumber(total) || !PHASE_FIELDS.every((field) => isNumber(route[field]))) return [];
    const phaseSum = PHASE_FIELDS.reduce((sum, field) => sum + route[field], 0);
    if (phaseSum === total) return [];
    return [{
      id: route.id,
      routeCode: route.routeCode ?? null,
      status: route.status ?? null,
      totalMinutes: total,
      phaseSum,
      invoiced: invoicedRouteIds.has(route.id),
    }];
  });
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

  const routes = await listAll(client.models.Route, {
    selectionSet: ['id', 'routeCode', 'status', 'overrideDurationMinutes', ...PHASE_FIELDS],
  });
  const invoices = await listAll(client.models.Invoice, { selectionSet: ['id', 'routeId'] });
  const invoicedRouteIds = new Set(invoices.map((invoice) => invoice.routeId).filter(Boolean));

  const mismatches = findBilledTimeMismatches(routes, invoicedRouteIds);
  for (const m of mismatches) {
    console.log(
      `  ${m.routeCode ?? m.id} (${m.id}) [${m.status}]: total ${m.totalMinutes} min, phases sum ${m.phaseSum} min${m.invoiced ? ', invoiced' : ''}`
    );
  }
  console.log(`\n${routes.length} Route(s) scanned, ${mismatches.length} mismatch(es).`);
}

if (process.argv[1]?.endsWith('report-billed-time-mismatches.js')) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
