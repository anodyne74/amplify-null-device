#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const ROUTE_CODE_RE = /W\d{2}-\d{2}-\d{3}/i;
const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parseArgs(argv) {
  const args = {
    tracker: '',
    routeListsDir: '',
    customerId: '',
    mode: 'dry-run',
    confirmApply: false,
    output: 'legacy-import-bundle.json',
    outputsPath: 'amplify_outputs.json',
    routeStatus: 'completed',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--tracker' && next) {
      args.tracker = next;
      i += 1;
      continue;
    }
    if (arg === '--route-lists-dir' && next) {
      args.routeListsDir = next;
      i += 1;
      continue;
    }
    if (arg === '--customer-id' && next) {
      args.customerId = next;
      i += 1;
      continue;
    }
    if (arg === '--mode' && next) {
      args.mode = next;
      i += 1;
      continue;
    }
    if (arg === '--confirm-apply') {
      args.confirmApply = true;
      continue;
    }
    if (arg === '--output' && next) {
      args.output = next;
      i += 1;
      continue;
    }
    if (arg === '--outputs-path' && next) {
      args.outputsPath = next;
      i += 1;
      continue;
    }
    if (arg === '--route-status' && next) {
      args.routeStatus = next;
      i += 1;
      continue;
    }
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/import-prep.js \
    --tracker /path/to/Tracker.csv \
    --route-lists-dir /path/to/route-lists \
    --customer-id <customer-id> \
    [--mode dry-run|apply] \
    [--confirm-apply] \
    [--output legacy-import-bundle.json] \
    [--outputs-path amplify_outputs.json] \
    [--route-status completed|archived]
`);
}

async function confirmApply(bundle) {
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive) {
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('Apply summary:');
    console.log(`  Routes: ${bundle.stats.routesPrepared}`);
    console.log(`  Invoices: ${bundle.stats.invoicesPrepared}`);
    console.log(`  Stops: ${bundle.stats.stopsPrepared}`);
    console.log(`  Warnings: ${bundle.warnings.length}`);

    const answer = await rl.question('Type yes to write these records to Amplify Data: ');
    if (answer.trim().toLowerCase() !== 'yes') {
      throw new Error('Apply cancelled by user.');
    }
  } finally {
    rl.close();
  }
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (cell.length > 0 || row.length > 0) {
        row.push(cell);
      }
      if (row.length > 0) {
        rows.push(row);
      }
      row = [];
      cell = '';
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseCurrency(raw) {
  if (!raw) return null;
  const normalized = String(raw).replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(String(raw).replace(/[^\d.-]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function parseKilometers(raw) {
  if (!raw) return null;
  return parseNumber(String(raw).replace(/km/i, '').trim());
}

function parseDurationMinutes(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  const hhmmss = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const hours = Number(hhmmss[1]);
    const minutes = Number(hhmmss[2]);
    return (hours * 60) + minutes;
  }
  const decimal = Number(text);
  if (Number.isFinite(decimal)) {
    return Math.round(decimal * 60);
  }
  return null;
}

function parseLegacyDate(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const monthName = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[\s-](\d{4})$/);
  if (monthName) {
    const day = Number(monthName[1]);
    const month = MONTHS[monthName[2].toLowerCase()];
    const year = Number(monthName[3]);
    if (month && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const month = Number(slash[2]);
    const day = Number(slash[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

function normalizeRouteCode(raw) {
  if (!raw) return null;
  const match = String(raw).match(ROUTE_CODE_RE);
  return match ? match[0].toUpperCase() : null;
}

function normalizeAddress(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function parseTracker(trackerPath) {
  const raw = fs.readFileSync(trackerPath, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(raw);
  if (rows.length === 0) {
    throw new Error('Tracker CSV is empty.');
  }

  const headers = rows[0].map((header) => String(header).trim());
  const findCol = (name) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());

  const idx = {
    routeId: findCol('RouteID'),
    job: findCol('Job'),
    signs: findCol('Signs'),
    stops: findCol('Stops'),
    kilometers: findCol('Kilometers'),
    invoice: findCol('Invoice'),
    hours: findCol('Hours'),
    rate: findCol('Rate'),
    amount: findCol('Amount'),
    sent: findCol('Sent'),
    paid: findCol('Paid'),
  };

  if (Object.values(idx).some((column) => column < 0)) {
    throw new Error('Tracker CSV is missing one or more expected columns A-K.');
  }

  const records = [];
  const warnings = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const routeCode = normalizeRouteCode(row[idx.routeId] || row[idx.job]);
    if (!routeCode) continue;

    const invoiceNumber = String(row[idx.invoice] || '').trim();
    if (!invoiceNumber) {
      warnings.push(`Row ${rowIndex + 1}: missing invoice number for ${routeCode}`);
    }

    const signs = parseNumber(row[idx.signs]);
    const stops = parseNumber(row[idx.stops]);
    const kilometers = parseKilometers(row[idx.kilometers]);
    const durationMinutes = parseDurationMinutes(row[idx.hours]);
    const rate = parseCurrency(row[idx.rate]);
    const amount = parseCurrency(row[idx.amount]);
    const sentDate = parseLegacyDate(row[idx.sent]);
    const paidDate = parseLegacyDate(row[idx.paid]);

    records.push({
      routeCode,
      jobLabel: String(row[idx.job] || '').trim(),
      invoiceNumber,
      summary: {
        signs,
        stops,
        kilometers,
        durationMinutes,
        rate,
        amount,
      },
      lifecycle: {
        sentDate,
        paidDate,
      },
      source: {
        trackerRow: rowIndex + 1,
      },
    });
  }

  return { records, warnings };
}

function parseRouteListFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(raw);
  const fileName = path.basename(filePath);
  const routeCode = normalizeRouteCode(fileName);

  const stops = [];
  const seen = new Set();
  for (const row of rows) {
    const sequence = parseNumber(row[0]);
    const address = normalizeAddress(row[1]);
    if (!sequence || !address || address.toLowerCase() === 'address') {
      continue;
    }

    const stopKey = `${sequence}|${address.toLowerCase()}`;
    if (seen.has(stopKey)) continue;
    seen.add(stopKey);

    let signCount = null;
    for (let i = row.length - 1; i >= 2; i -= 1) {
      const parsed = parseNumber(row[i]);
      if (parsed !== null) {
        signCount = parsed;
        break;
      }
    }

    stops.push({
      sequence,
      address,
      numberOfSigns: signCount,
      serviceType: 'delivery',
    });
  }

  return {
    routeCode,
    filePath,
    stops: stops.sort((a, b) => a.sequence - b.sequence),
  };
}

function buildRouteListIndex(routeListsDir) {
  const files = fs
    .readdirSync(routeListsDir)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .map((name) => path.join(routeListsDir, name));

  const index = new Map();
  const warnings = [];

  for (const filePath of files) {
    const parsed = parseRouteListFile(filePath);
    if (!parsed.routeCode) {
      warnings.push(`Route list file skipped (no route code in filename): ${path.basename(filePath)}`);
      continue;
    }
    index.set(parsed.routeCode, parsed);
  }

  return { index, warnings };
}

function deriveInvoiceStatus(sentDate, paidDate) {
  if (paidDate) return 'paid';
  if (sentDate) return 'sent';
  return 'finalized';
}

function buildBundle({ trackerRecords, trackerWarnings, routeLists, routeListWarnings, args }) {
  const records = trackerRecords.map((trackerRecord) => {
    const routeList = routeLists.get(trackerRecord.routeCode);
    return {
      importKey: `${trackerRecord.routeCode}::${trackerRecord.invoiceNumber || 'NO-INVOICE'}`,
      customerId: args.customerId,
      route: {
        routeCode: trackerRecord.routeCode,
        status: args.routeStatus,
        overrideSigns: trackerRecord.summary.signs,
        overrideStops: trackerRecord.summary.stops,
        overrideDistanceKm: trackerRecord.summary.kilometers,
        overrideDurationMinutes: trackerRecord.summary.durationMinutes,
        actualDurationMinutes: trackerRecord.summary.durationMinutes,
        notes: `Legacy import (${trackerRecord.jobLabel || trackerRecord.routeCode})`,
      },
      invoice: {
        invoiceNumber: trackerRecord.invoiceNumber,
        invoiceDate: trackerRecord.lifecycle.sentDate,
        totalAmount: trackerRecord.summary.amount,
        status: deriveInvoiceStatus(trackerRecord.lifecycle.sentDate, trackerRecord.lifecycle.paidDate),
      },
      lineItem: {
        description: `Legacy route ${trackerRecord.routeCode}`,
        quantity: trackerRecord.summary.durationMinutes
          ? Number((trackerRecord.summary.durationMinutes / 60).toFixed(2))
          : 1,
        ratePerUnit: trackerRecord.summary.rate,
        amount: trackerRecord.summary.amount,
      },
      stops: routeList?.stops || [],
      source: {
        trackerRow: trackerRecord.source.trackerRow,
        routeListFile: routeList ? path.basename(routeList.filePath) : null,
      },
      warnings: [
        ...(routeList ? [] : [`Missing route list CSV for ${trackerRecord.routeCode}`]),
      ],
    };
  });

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    sourceFiles: {
      tracker: args.tracker,
      routeListsDir: args.routeListsDir,
    },
    stats: {
      trackerRows: trackerRecords.length,
      routeListFilesMatched: records.filter((record) => record.source.routeListFile).length,
      routesPrepared: records.length,
      invoicesPrepared: records.filter((record) => record.invoice.invoiceNumber).length,
      stopsPrepared: records.reduce((sum, record) => sum + record.stops.length, 0),
      warnings: trackerWarnings.length + routeListWarnings.length + records.reduce((sum, record) => sum + record.warnings.length, 0),
    },
    warnings: [
      ...trackerWarnings,
      ...routeListWarnings,
      ...records.flatMap((record) => record.warnings),
    ],
    records,
  };
}

async function applyBundle(bundle, args) {
  const { Amplify } = await import('aws-amplify');
  const { generateClient } = await import('aws-amplify/data');

  const outputsRaw = fs.readFileSync(args.outputsPath, 'utf8');
  const outputs = JSON.parse(outputsRaw);
  Amplify.configure(outputs);

  const client = generateClient();
  const authMode = 'iam';

  const routeCache = new Map();
  const invoiceCache = new Map();

  const summary = {
    routesCreated: 0,
    routesUpdated: 0,
    stopsCreated: 0,
    stopsUpdated: 0,
    invoicesCreated: 0,
    invoicesUpdated: 0,
    lineItemsCreated: 0,
    errors: [],
  };

  console.log(`Applying ${bundle.records.length} legacy records...`);

  for (let index = 0; index < bundle.records.length; index += 1) {
    const record = bundle.records[index];
    try {
      if (index === 0 || (index + 1) % 10 === 0 || index === bundle.records.length - 1) {
        console.log(`  -> ${index + 1}/${bundle.records.length}: ${record.route.routeCode}`);
      }

      const routeKey = `${record.customerId}::${record.route.routeCode}`;
      let route = routeCache.get(routeKey);

      if (!route) {
        const routeLookup = await client.models.Route.list(
          {
            filter: {
              customerId: { eq: record.customerId },
              routeCode: { eq: record.route.routeCode },
            },
            limit: 1,
          },
          { authMode }
        );
        route = routeLookup.data?.[0] || null;
      }

      const routePayload = {
        customerId: record.customerId,
        routeCode: record.route.routeCode,
        status: record.route.status,
        overrideSigns: record.route.overrideSigns ?? undefined,
        overrideStops: record.route.overrideStops ?? undefined,
        overrideDistanceKm: record.route.overrideDistanceKm ?? undefined,
        overrideDurationMinutes: record.route.overrideDurationMinutes ?? undefined,
        actualDurationMinutes: record.route.actualDurationMinutes ?? undefined,
        notes: record.route.notes,
      };

      if (route?.id) {
        const routeUpdate = await client.models.Route.update({ id: route.id, ...routePayload }, { authMode });
        route = routeUpdate.data || route;
        summary.routesUpdated += 1;
      } else {
        const routeCreate = await client.models.Route.create(routePayload, { authMode });
        route = routeCreate.data || null;
        summary.routesCreated += 1;
      }

      if (!route?.id) {
        summary.errors.push(`Failed to upsert route ${record.route.routeCode}`);
        continue;
      }

      routeCache.set(routeKey, route);

      const existingStops = await client.models.Stop.list(
        { filter: { routeId: { eq: route.id } }, limit: 1000 },
        { authMode }
      );
      const stopMap = new Map(
        (existingStops.data || []).map((stop) => [`${stop.sequence}|${normalizeAddress(stop.address).toLowerCase()}`, stop])
      );

      for (const stopRecord of record.stops) {
        const stopKey = `${stopRecord.sequence}|${normalizeAddress(stopRecord.address).toLowerCase()}`;
        const existingStop = stopMap.get(stopKey);
        const stopPayload = {
          routeId: route.id,
          customerId: record.customerId,
          sequence: stopRecord.sequence,
          address: stopRecord.address,
          serviceType: stopRecord.serviceType,
          numberOfSigns: stopRecord.numberOfSigns ?? undefined,
        };

        if (existingStop?.id) {
          await client.models.Stop.update({ id: existingStop.id, ...stopPayload }, { authMode });
          summary.stopsUpdated += 1;
        } else {
          await client.models.Stop.create(stopPayload, { authMode });
          summary.stopsCreated += 1;
        }
      }

      if (!record.invoice.invoiceNumber) {
        continue;
      }

      const invoiceKey = `${record.customerId}::${record.invoice.invoiceNumber}`;
      let invoice = invoiceCache.get(invoiceKey);
      if (!invoice) {
        const invoiceLookup = await client.models.Invoice.list(
          {
            filter: {
              customerId: { eq: record.customerId },
              invoiceNumber: { eq: record.invoice.invoiceNumber },
            },
            limit: 1,
          },
          { authMode }
        );
        invoice = invoiceLookup.data?.[0] || null;
      }

      const invoicePayload = {
        customerId: record.customerId,
        invoiceNumber: record.invoice.invoiceNumber,
        invoiceDate: record.invoice.invoiceDate || new Date().toISOString().slice(0, 10),
        totalAmount: record.invoice.totalAmount ?? 0,
        status: record.invoice.status,
        routeId: route.id,
      };

      if (invoice?.id) {
        const invoiceUpdate = await client.models.Invoice.update({ id: invoice.id, ...invoicePayload }, { authMode });
        invoice = invoiceUpdate.data || invoice;
        summary.invoicesUpdated += 1;
      } else {
        const invoiceCreate = await client.models.Invoice.create(invoicePayload, { authMode });
        invoice = invoiceCreate.data || null;
        summary.invoicesCreated += 1;
      }

      if (!invoice?.id) {
        summary.errors.push(`Failed to upsert invoice ${record.invoice.invoiceNumber}`);
        continue;
      }

      invoiceCache.set(invoiceKey, invoice);

      const existingLineItems = await client.models.LineItem.list(
        {
          filter: {
            invoiceId: { eq: invoice.id },
          },
          limit: 50,
        },
        { authMode }
      );

      const hasLegacyLineItem = (existingLineItems.data || []).some((lineItem) =>
        String(lineItem.description || '').startsWith('Legacy route')
      );

      if (!hasLegacyLineItem && record.lineItem.amount !== null && record.lineItem.ratePerUnit !== null) {
        await client.models.LineItem.create(
          {
            invoiceId: invoice.id,
            routeId: route.id,
            customerId: record.customerId,
            description: record.lineItem.description,
            quantity: record.lineItem.quantity,
            ratePerUnit: record.lineItem.ratePerUnit,
            amount: record.lineItem.amount,
          },
          { authMode }
        );
        summary.lineItemsCreated += 1;
      }
    } catch (error) {
      summary.errors.push(`${record.importKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `Apply summary: ${summary.routesCreated} route(s) created, ${summary.routesUpdated} updated; ` +
    `${summary.invoicesCreated} invoice(s) created, ${summary.invoicesUpdated} updated; ` +
    `${summary.stopsCreated} stop(s) created, ${summary.stopsUpdated} updated; ` +
    `${summary.lineItemsCreated} line item(s) created.`
  );

  return summary;
}

function validateArgs(args) {
  if (!args.tracker || !args.routeListsDir || !args.customerId) {
    usage();
    throw new Error('Missing required args: --tracker, --route-lists-dir, --customer-id');
  }

  if (!fs.existsSync(args.tracker)) {
    throw new Error(`Tracker file not found: ${args.tracker}`);
  }

  if (!fs.existsSync(args.routeListsDir)) {
    throw new Error(`Route lists directory not found: ${args.routeListsDir}`);
  }

  if (!['dry-run', 'apply'].includes(args.mode)) {
    throw new Error(`Unsupported mode '${args.mode}'. Use dry-run or apply.`);
  }

  if (args.mode === 'apply' && !args.confirmApply) {
    throw new Error('Apply mode requires --confirm-apply to protect against accidental writes.');
  }

  if (!['completed', 'archived'].includes(args.routeStatus)) {
    throw new Error(`Unsupported route status '${args.routeStatus}'. Use completed or archived.`);
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    validateArgs(args);

    const { records: trackerRecords, warnings: trackerWarnings } = parseTracker(args.tracker);
    const { index: routeLists, warnings: routeListWarnings } = buildRouteListIndex(args.routeListsDir);

    const bundle = buildBundle({
      trackerRecords,
      trackerWarnings,
      routeLists,
      routeListWarnings,
      args,
    });

    if (args.mode === 'apply') {
      await confirmApply(bundle);
      const applySummary = await applyBundle(bundle, args);
      bundle.applySummary = applySummary;
      if (applySummary.errors.length > 0) {
        bundle.warnings.push(...applySummary.errors);
      }
    }

    fs.writeFileSync(args.output, JSON.stringify(bundle, null, 2));

    console.log(`Prepared ${bundle.stats.routesPrepared} route records.`);
    console.log(`Prepared ${bundle.stats.invoicesPrepared} invoice records.`);
    console.log(`Prepared ${bundle.stats.stopsPrepared} stop records.`);
    console.log(`Warnings: ${bundle.warnings.length}`);
    console.log(`Output written: ${args.output}`);

    if (args.mode === 'apply' && bundle.applySummary?.errors?.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
