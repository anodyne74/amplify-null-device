#!/usr/bin/env node
/**
 * One-off backfill: set periodStartDate and periodEndDate on OperatorPayouts that
 * have none, to the UTC date of the linked Route's actualEndTime (a Payout
 * imported from history is for a single Route, so its period is that one day --
 * CONTEXT.md). Imports before this change wrote a routeId but no period.
 * Never overwrites a period that is already set, never uses createdAt (for an
 * imported payout that is the import date). Payouts with no usable Route are left
 * untouched and listed. Idempotent -- safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-payout-periods.js \
 *     [--mode dry-run|apply] [--confirm-apply] \
 *     [--outputs-path amplify_outputs.json] [--allow-non-development]
 *
 * Refuses to run against anything but the development API unless
 * --allow-non-development is given. Needs an administrator login.
 *
 * Auth (same pattern as import-prep.js / backfill-route-scheduled-dates.js):
 *   IMPORT_PREP_USERNAME=admin@example.com IMPORT_PREP_PASSWORD=secret node scripts/backfill-payout-periods.js ...
 */

import fs from 'node:fs';
import { assertDevelopmentTarget, parseArgs } from './backfill-route-scheduled-dates.js';

function utcDate(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function planPayoutPeriodBackfill(payouts, routes) {
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const plan = { changes: [], pending: [], alreadySet: 0, skipped: [] };

  for (const payout of payouts) {
    if (payout.periodStartDate || payout.periodEndDate) {
      plan.alreadySet += 1;
      continue;
    }
    const route = payout.routeId ? routesById.get(payout.routeId) : null;
    const skip = (reason) => plan.skipped.push({ id: payout.id, routeCode: route?.routeCode ?? null, reason });
    if (!payout.routeId) { skip('no route linked'); continue; }
    if (!route) { skip('route not found'); continue; }
    const day = utcDate(route.actualEndTime);
    if (!day) { skip('route has no end time'); continue; }

    const change = {
      id: payout.id,
      routeCode: route.routeCode ?? null,
      status: payout.status,
      amount: payout.amount,
      periodStartDate: day,
      periodEndDate: day,
    };
    plan.changes.push(change);
    if (payout.status === 'pending') plan.pending.push(change);
  }
  return plan;
}

async function listAllItems(model, selectionSet) {
  let items = [];
  let nextToken;
  do {
    const page = await model.list({ selectionSet, limit: 1000, nextToken });
    if (page.errors?.length) {
      throw new Error(`Listing failed: ${JSON.stringify(page.errors)}`);
    }
    items = items.concat(page.data || []);
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
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

  const payouts = await listAllItems(client.models.OperatorPayout, [
    'id', 'routeId', 'status', 'amount', 'periodStartDate', 'periodEndDate',
  ]);
  const routes = await listAllItems(client.models.Route, ['id', 'routeCode', 'actualEndTime']);

  const plan = planPayoutPeriodBackfill(payouts, routes);

  console.log(
    `${payouts.length} payout(s): ${plan.changes.length} to update, ${plan.alreadySet} already have a period (left unchanged), ` +
      `${plan.skipped.length} that cannot be dated.`
  );
  for (const skipped of plan.skipped) {
    console.log(`  SKIPPED payout ${skipped.id}${skipped.routeCode ? ` (${skipped.routeCode})` : ''}: ${skipped.reason}`);
  }
  if (plan.pending.length > 0) {
    const owed = plan.pending.reduce((sum, change) => sum + (change.amount || 0), 0);
    console.log(`\n${plan.pending.length} of the payouts to update are still PENDING ($${owed.toFixed(2)} outstanding) -- confirm these are really unpaid:`);
    for (const change of plan.pending) {
      console.log(`  pending ${change.routeCode || change.id}: $${(change.amount || 0).toFixed(2)}`);
    }
  }
  console.log('');

  let updated = 0;
  let failed = 0;
  for (const change of plan.changes) {
    const label = `${change.routeCode || change.id}: period -> ${change.periodEndDate}`;
    if (args.mode === 'dry-run') {
      console.log(`  [dry-run] ${label}`);
      continue;
    }
    const { errors } = await client.models.OperatorPayout.update({
      id: change.id,
      periodStartDate: change.periodStartDate,
      periodEndDate: change.periodEndDate,
    });
    if (errors?.length) {
      console.error(`  FAILED ${label}:`, errors);
      failed += 1;
    } else {
      console.log(`  Updated ${label}`);
      updated += 1;
    }
  }

  if (args.mode === 'dry-run') {
    console.log(`\nDry run complete. ${plan.changes.length} payout(s) would be updated. Re-run with --mode apply --confirm-apply.`);
  } else {
    console.log(`\nBackfill complete. Updated: ${updated}, Failed: ${failed}`);
    if (failed > 0) process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('backfill-payout-periods.js')) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
