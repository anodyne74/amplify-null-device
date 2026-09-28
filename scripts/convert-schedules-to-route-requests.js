#!/usr/bin/env node
/**
 * One-off conversion (development only, #359): turns every Route's Schedule
 * file (Route.scheduleS3Key) into a manual Route Request linked to it. Its
 * requester is "uploaded by administrator" (none recorded), it's dated when
 * the Route was created, and its file is copied to requests/<record id>/.
 * The record id is schedule-<route id>, so a re-run finds what's done and
 * finishes anything an earlier run left part-way. A Route that already has
 * another Route Request is left alone and reported. Never deletes the
 * schedules/ file or clears scheduleS3Key -- removing those is a later cleanup.
 *
 * Usage:
 *   node scripts/convert-schedules-to-route-requests.js \
 *     [--mode dry-run|apply] [--confirm-apply] \
 *     [--outputs-path amplify_outputs.json] [--allow-non-development]
 *
 * Refuses to run against anything but the development API unless
 * --allow-non-development is given.
 *
 * Auth (same pattern as backfill-route-scheduled-dates.js), as an administrator:
 *   IMPORT_PREP_USERNAME=admin@example.com IMPORT_PREP_PASSWORD=secret node scripts/convert-schedules-to-route-requests.js ...
 */

import fs from 'node:fs';

// GraphQL endpoint host of the development branch's AppSync API
// (amplify:branch-name=development).
const DEVELOPMENT_GRAPHQL_HOST = 'uczffjaqz5ep3cowq5l7f64ziy.appsync-api.ap-southeast-2.amazonaws.com';

/** The name the file was uploaded with: New route put the upload time in front of it. */
export function scheduleFilename(key) {
  return key.split('/').pop().replace(/^\d{10,}-/, '');
}

// Same rule as lib/routeRequestKey.ts's requestAttachmentKey.
function requestAttachmentKey(recordId, index, filename) {
  return `requests/${recordId}/${index}-${filename.replace(/[/\\?#%*:|"<>\u0000-\u001f]/g, '_')}`;
}

/**
 * What to do with each Route that has a Schedule: `convert` (the steps are
 * safe to repeat), `done` (its record exists and holds the Route's slot), or
 * `hasRouteRequest` (another record holds the slot).
 */
export function planScheduleConversion(routes, records, slots) {
  const recordIds = new Set(records.map((record) => record.id));
  const holders = new Map(slots.map((slot) => [slot.id, slot.recordId]));
  const plan = { convert: [], done: [], hasRouteRequest: [] };

  for (const route of routes) {
    if (!route.scheduleS3Key) continue;
    const recordId = `schedule-${route.id}`;
    const holder = holders.get(route.id);
    if (holder && holder !== recordId) {
      plan.hasRouteRequest.push({ routeId: route.id, routeCode: route.routeCode ?? null, recordId: holder });
      continue;
    }
    if (holder === recordId && recordIds.has(recordId)) {
      plan.done.push(route.id);
      continue;
    }
    const filename = scheduleFilename(route.scheduleS3Key);
    plan.convert.push({
      recordId,
      routeId: route.id,
      routeCode: route.routeCode ?? null,
      customerId: route.customerId,
      sentAt: route.createdAt,
      sourceKey: route.scheduleS3Key,
      destinationKey: requestAttachmentKey(recordId, 0, filename),
      filename,
    });
  }
  return plan;
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

async function listEvery(model, selectionSet, what) {
  let items = [];
  let nextToken;
  do {
    const page = await model.list({ selectionSet, limit: 1000, nextToken });
    if (page.errors?.length) {
      throw new Error(`Listing ${what} failed: ${JSON.stringify(page.errors)}`);
    }
    items = items.concat(page.data || []);
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
}

/** Copies the file, takes the Route's slot, then creates the record: each step is skipped or harmless if already done. */
async function convert(client, storage, item, now, bySub) {
  const { contentType, size } = await storage.getProperties({ path: item.sourceKey });
  await storage.copy({ source: { path: item.sourceKey }, destination: { path: item.destinationKey } });

  const claimed = await client.models.RouteRequestSlot.create({ id: item.routeId, recordId: item.recordId });
  if (claimed.errors?.length) {
    const { data: slot } = await client.models.RouteRequestSlot.get({ id: item.routeId });
    if (slot?.recordId !== item.recordId) {
      throw new Error(`The Route's Route Request slot is held by ${slot?.recordId ?? 'nothing'}: ${JSON.stringify(claimed.errors)}`);
    }
  }

  const { data: existing } = await client.models.RouteRequestRecord.get({ id: item.recordId });
  if (existing) return;
  const { errors } = await client.models.RouteRequestRecord.create({
    id: item.recordId,
    source: 'manual',
    status: 'linked',
    routeId: item.routeId,
    role: 'request',
    sentAt: item.sentAt,
    receivedAt: now,
    linkedAt: now,
    linkedBySub: bySub,
    enteredBySub: bySub,
    requesterName: null,
    suggestedCustomerId: item.customerId,
    attachments: [
      { key: item.destinationKey, filename: item.filename, contentType: contentType ?? null, size: size ?? null, inline: false },
    ],
  });
  if (errors?.length) throw new Error(`Creating the record failed: ${JSON.stringify(errors)}`);
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
  const { getCurrentUser, signIn } = await import('aws-amplify/auth');
  const storage = await import('aws-amplify/storage');

  Amplify.configure(outputs);

  const username = args.username || process.env.IMPORT_PREP_USERNAME;
  const password = args.password || process.env.IMPORT_PREP_PASSWORD;
  if (!username || !password) {
    throw new Error('Set IMPORT_PREP_USERNAME and IMPORT_PREP_PASSWORD or pass --username/--password.');
  }
  await signIn({ username, password });
  const { userId } = await getCurrentUser();

  const client = generateClient();
  const [routes, records, slots] = await Promise.all([
    listEvery(client.models.Route, ['id', 'routeCode', 'customerId', 'createdAt', 'scheduleS3Key'], 'routes'),
    listEvery(client.models.RouteRequestRecord, ['id'], 'Route Request records'),
    listEvery(client.models.RouteRequestSlot, ['id', 'recordId'], 'Route Request slots'),
  ]);

  const plan = planScheduleConversion(routes, records, slots);
  console.log(
    `${routes.length} route(s): ${plan.convert.length} to convert, ${plan.done.length} already converted, ` +
      `${plan.hasRouteRequest.length} already have another Route Request (left alone).`
  );
  for (const skipped of plan.hasRouteRequest) {
    console.log(`  Skipped ${skipped.routeCode || skipped.routeId}: its Route Request is ${skipped.recordId}`);
  }

  let converted = 0;
  let failed = 0;
  const now = new Date().toISOString();
  for (const item of plan.convert) {
    const label = `${item.routeCode || item.routeId}: ${item.sourceKey} -> ${item.destinationKey}`;
    if (args.mode === 'dry-run') {
      console.log(`  [dry-run] ${label}`);
      continue;
    }
    try {
      await convert(client, storage, item, now, userId);
      console.log(`  Converted ${label}`);
      converted += 1;
    } catch (error) {
      console.error(`  FAILED ${label}:`, error.message ?? error);
      failed += 1;
    }
  }

  if (args.mode === 'dry-run') {
    console.log(`\nDry run complete. ${plan.convert.length} route(s) would be converted. Re-run with --mode apply --confirm-apply.`);
  } else {
    console.log(`\nConversion complete. Converted: ${converted}, Failed: ${failed}. Re-run to retry any failures.`);
    if (failed > 0) process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('convert-schedules-to-route-requests.js')) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
