#!/usr/bin/env node
/**
 * One-off backfill (development only): set Route.scheduledDate on routes that
 * have none, from the UTC date of actualStartTime, else placementStartTime.
 * Routes from the 2026-09-18/19 bulk import carry their original run date only
 * in those fields, so the customer portal fell back to showing the import date
 * (#314). Never overwrites an existing scheduledDate, never touches createdAt.
 * Idempotent -- safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-route-scheduled-dates.js \
 *     [--mode dry-run|apply] [--confirm-apply] \
 *     [--outputs-path amplify_outputs.json] [--allow-non-development]
 *
 * Refuses to run against anything but the development API unless
 * --allow-non-development is given.
 *
 * Auth (same pattern as import-prep.js / migrate-finalized-status.js):
 *   IMPORT_PREP_USERNAME=admin@example.com IMPORT_PREP_PASSWORD=secret node scripts/backfill-route-scheduled-dates.js ...
 */

import fs from 'node:fs';

// GraphQL endpoint host of the development branch's AppSync API
// (amplify:branch-name=development).
const DEVELOPMENT_GRAPHQL_HOST = 'uczffjaqz5ep3cowq5l7f64ziy.appsync-api.ap-southeast-2.amazonaws.com';

function utcDate(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function planScheduledDateBackfill(routes) {
  return routes
    .filter((route) => !route.scheduledDate)
    .map((route) => ({
      id: route.id,
      routeCode: route.routeCode ?? null,
      current: route.scheduledDate ?? null,
      next: utcDate(route.actualStartTime) ?? utcDate(route.placementStartTime),
    }))
    .filter((change) => change.next);
}

export function assertDevelopmentTarget(outputs, allowNonDevelopment) {
  if (allowNonDevelopment) return;
  let host = '';
  try {
    host = new URL(outputs?.data?.url).host;
  } catch {
    // no or malformed URL -- refused below
  }
  if (host !== DEVELOPMENT_GRAPHQL_HOST) {
    throw new Error(
      `Refusing to run: ${host || 'this outputs file'} is not the development API. ` +
        'Pass --allow-non-development to override.'
    );
  }
}

export function parseArgs(argv) {
  const args = {
    mode: 'dry-run',
    confirmApply: false,
    outputsPath: 'amplify_outputs.json',
    allowNonDevelopment: false,
    username: '',
    password: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--mode' && argv[i + 1]) { args.mode = argv[i += 1]; continue; }
    if (argv[i] === '--confirm-apply') { args.confirmApply = true; continue; }
    if (argv[i] === '--outputs-path' && argv[i + 1]) { args.outputsPath = argv[i += 1]; continue; }
    if (argv[i] === '--allow-non-development') { args.allowNonDevelopment = true; continue; }
    if (argv[i] === '--username' && argv[i + 1]) { args.username = argv[i += 1]; continue; }
    if (argv[i] === '--password' && argv[i + 1]) { args.password = argv[i += 1]; continue; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!['dry-run', 'apply'].includes(args.mode)) {
    throw new Error(`Unsupported mode '${args.mode}'. Use dry-run or apply.`);
  }
  if (args.mode === 'apply' && !args.confirmApply) {
    throw new Error('Apply mode requires --confirm-apply to protect against accidental writes.');
  }

  const outputs = JSON.parse(fs.readFileSync(args.outputsPath, 'utf8'));
  assertDevelopmentTarget(outputs, args.allowNonDevelopment);

  const { Amplify } = await import('aws-amplify');
  const { generateClient } = await import('aws-amplify/data');
  const { signIn } = await import('aws-amplify/auth');

  Amplify.configure(outputs);

  const username = args.username || process.env.IMPORT_PREP_USERNAME;
  const password = args.password || process.env.IMPORT_PREP_PASSWORD;
  if (!username || !password) {
    throw new Error('Set IMPORT_PREP_USERNAME and IMPORT_PREP_PASSWORD or pass --username/--password.');
  }
  await signIn({ username, password });

  const client = generateClient();

  let routes = [];
  let nextToken;
  do {
    const page = await client.models.Route.list({
      selectionSet: ['id', 'routeCode', 'scheduledDate', 'actualStartTime', 'placementStartTime'],
      limit: 1000,
      nextToken,
    });
    if (page.errors?.length) {
      throw new Error(`Listing routes failed: ${JSON.stringify(page.errors)}`);
    }
    routes = routes.concat(page.data || []);
    nextToken = page.nextToken;
  } while (nextToken);

  const changes = planScheduledDateBackfill(routes);
  const alreadySet = routes.filter((route) => route.scheduledDate).length;
  const noSource = routes.length - alreadySet - changes.length;

  console.log(
    `${routes.length} route(s): ${changes.length} to update, ${alreadySet} already have a scheduledDate (left unchanged), ` +
      `${noSource} with no start time to use.`
  );

  let updated = 0;
  let failed = 0;
  for (const change of changes) {
    const label = `${change.routeCode || change.id}: ${change.current ?? '(empty)'} -> ${change.next}`;
    if (args.mode === 'dry-run') {
      console.log(`  [dry-run] ${label}`);
      continue;
    }
    const { errors } = await client.models.Route.update({ id: change.id, scheduledDate: change.next });
    if (errors?.length) {
      console.error(`  FAILED ${label}:`, errors);
      failed += 1;
    } else {
      console.log(`  Updated ${label}`);
      updated += 1;
    }
  }

  if (args.mode === 'dry-run') {
    console.log(`\nDry run complete. ${changes.length} route(s) would be updated. Re-run with --mode apply --confirm-apply.`);
  } else {
    console.log(`\nBackfill complete. Updated: ${updated}, Failed: ${failed}`);
    if (failed > 0) process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('backfill-route-scheduled-dates.js')) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
