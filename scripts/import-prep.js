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
    invoicePdfsDir: '',
    customerId: '',
    mode: 'dry-run',
    confirmApply: false,
    output: 'legacy-import-bundle.json',
    outputsPath: 'amplify_outputs.json',
    routeStatus: 'completed',
    authMode: 'userPool',
    username: '',
    password: '',
    defaultOperatorName: '',
    defaultOperatorSub: '',
    defaultOperatorEmail: '',
    // name (lowercased) -> { name, sub, email }, built from repeatable --operator flags.
    // Resolves the Tracker's per-row Operator column so routes/payouts spanning an
    // operator handover (e.g. Adam -> Aishling) get the right assignee per row,
    // rather than the single global --default-operator-* applied to every route.
    operators: new Map(),
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
    if (arg === '--invoice-pdfs-dir' && next) {
      args.invoicePdfsDir = next;
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
    if (arg === '--auth-mode' && next) {
      args.authMode = next;
      i += 1;
      continue;
    }
    if (arg === '--username' && next) {
      args.username = next;
      i += 1;
      continue;
    }
    if (arg === '--password' && next) {
      args.password = next;
      i += 1;
      continue;
    }
    if (arg === '--default-operator-name' && next) {
      args.defaultOperatorName = next;
      i += 1;
      continue;
    }
    if (arg === '--default-operator-sub' && next) {
      args.defaultOperatorSub = next;
      i += 1;
      continue;
    }
    if (arg === '--default-operator-email' && next) {
      args.defaultOperatorEmail = next;
      i += 1;
      continue;
    }
    if (arg === '--operator' && next) {
      const [name, sub, email] = next.split(':');
      if (!name || !sub) {
        throw new Error(`Invalid --operator value '${next}'. Expected Name:sub:email.`);
      }
      args.operators.set(name.trim().toLowerCase(), { name: name.trim(), sub: sub.trim(), email: (email || '').trim() });
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
    [--route-lists-dir /path/to/route-lists] \
    [--invoice-pdfs-dir /path/to/invoice-pdfs] \
    --customer-id <customer-id> \
    [--mode dry-run|apply|pdf-only] \
    [--confirm-apply] \
    [--output legacy-import-bundle.json] \
    [--outputs-path amplify_outputs.json] \
    [--route-status completed|archived] \
    [--auth-mode userPool|iam] \
    [--username <cognito-username-or-email>] \
    [--password <cognito-password>] \
    [--default-operator-name <name>] \
    [--default-operator-sub <cognito-sub>] \
    [--default-operator-email <email>] \
    [--operator <Name>:<cognito-sub>:<email>] [--operator <Name>:<cognito-sub>:<email> ...]

  When the Tracker has an Operator column, each row's operator name is looked up
  in the --operator map (repeatable) to assign Route.assignedOperatorName/Sub/Email
  per row -- so a route handover between operators partway through the Tracker
  (e.g. Adam -> Aishling) is preserved. If a row's Operator name isn't in the map,
  no operator is assigned to that row and a warning is recorded (it does NOT fall
  back to --default-operator-*, to avoid silently misattributing a route). Rows
  with no Operator column value at all fall back to --default-operator-name/sub/email.

  When the Tracker has a Split column, its dollar value becomes an OperatorPayout
  for the row's resolved operator (skipped, with a warning, if no operator could
  be resolved for that row).

  Operator sub/email are branch-specific (each Amplify branch has its own Cognito
  user pool, so the same person has a different sub per branch) so pass the values
  for whichever branch --outputs-path points at.

  Auth notes:
    - Default auth mode is userPool and requires an operator/administrator user.
    - Prefer environment variables for credentials:
      IMPORT_PREP_USERNAME, IMPORT_PREP_PASSWORD
    - IAM mode requires identity pool federation and is not recommended for this import.
`);
}

function normalizeToken(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
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
  const stripped = String(raw).replace(/[^\d.-]/g, '');
  if (stripped === '' || stripped === '-' || stripped === '.') return null;
  const value = Number(stripped);
  return Number.isFinite(value) ? value : null;
}

export function round2(value) {
  return Math.round(value * 100) / 100;
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

  // Optional -- older Tracker exports (or the CSV fixtures in import-prep.test.ts)
  // don't have these columns, so they're not part of the A-K required check above.
  const operatorCol = findCol('Operator');
  const splitCol = findCol('Split');

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
    const operatorName = operatorCol >= 0 ? String(row[operatorCol] || '').trim() : '';
    const splitAmount = splitCol >= 0 ? parseCurrency(row[splitCol]) : null;

    records.push({
      routeCode,
      jobLabel: String(row[idx.job] || '').trim(),
      invoiceNumber,
      operatorName,
      splitAmount,
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

// Route-list CSVs come in 3 layouts (see legacy exports): a 5-column layout with
// no auction/agent/signs data at all ('Check' at index 2), a 6-9-column "Sell"
// layout with a combined auction-flag column and no agent column ('Check' at
// index 3), and a 8-9-column layout with separate auction-flag (col C) and
// agent-initials (col D) columns ('Check' at index 4). Detecting the 'Check'
// header's position lets us handle all three without relying on exact column counts.
function detectRouteListFormat(headerRow) {
  const checkIdx = headerRow.findIndex((cell) => String(cell).trim().toLowerCase() === 'check');
  if (checkIdx === 3) return { auctionCol: 2, agentCol: null };
  if (checkIdx === 4) return { auctionCol: 2, agentCol: 3 };
  return { auctionCol: null, agentCol: null };
}

const AUCTION_FLAG_SYMBOL = '\uD83C\uDD70\uFE0F';
const AGENT_INITIALS_RE = /^[A-Za-z]{1,4}$/;
const DEFAULT_AGENT = 'BO';

function parseRouteListFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(raw);
  const fileName = path.basename(filePath);
  const routeCode = normalizeRouteCode(fileName);
  const warnings = [];

  const { auctionCol, agentCol } = rows.length > 0 ? detectRouteListFormat(rows[0]) : { auctionCol: null, agentCol: null };

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

    const auctionRaw = auctionCol !== null ? String(row[auctionCol] || '').trim() : '';
    const isAuction = auctionRaw === AUCTION_FLAG_SYMBOL;
    if (auctionRaw && !isAuction) {
      warnings.push(
        `${fileName}: unrecognized auction-column value '${auctionRaw}' at stop ${sequence} (${address}) \u2014 not treated as an auction.`
      );
    }

    const agentRaw = agentCol !== null ? String(row[agentCol] || '').trim() : '';
    let agent = DEFAULT_AGENT;
    if (agentRaw) {
      if (AGENT_INITIALS_RE.test(agentRaw)) {
        agent = agentRaw.toUpperCase();
      } else {
        warnings.push(
          `${fileName}: unrecognized agent-column value '${agentRaw}' at stop ${sequence} (${address}) \u2014 defaulted agent to '${DEFAULT_AGENT}'.`
        );
      }
    }

    stops.push({
      sequence,
      address,
      numberOfSigns: signCount,
      serviceType: 'delivery',
      isAuction,
      agent,
    });
  }

  return {
    routeCode,
    filePath,
    stops: stops.sort((a, b) => a.sequence - b.sequence),
    warnings,
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
    warnings.push(...parsed.warnings);
    index.set(parsed.routeCode, parsed);
  }

  return { index, warnings };
}

function buildInvoicePdfIndex(invoicePdfsDir) {
  if (!invoicePdfsDir) {
    return { index: new Map(), warnings: [] };
  }

  const files = fs
    .readdirSync(invoicePdfsDir)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .map((name) => path.join(invoicePdfsDir, name));

  const index = new Map();
  const warnings = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath, path.extname(filePath));
    const key = normalizeToken(fileName);
    if (!key) {
      warnings.push(`Invoice PDF skipped (no usable key): ${path.basename(filePath)}`);
      continue;
    }

    if (index.has(key)) {
      warnings.push(`Duplicate invoice PDF match key '${key}' (keeping first): ${path.basename(filePath)}`);
      continue;
    }

    index.set(key, filePath);
  }

  return { index, warnings };
}

export function deriveInvoiceStatus(sentDate, paidDate) {
  if (paidDate) return 'paid';
  if (sentDate) return 'sent';
  return 'draft';
}

function toIsoDateTime(dateValue) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const asText = String(dateValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(asText)) {
    return `${asText}T23:59:59.000Z`;
  }

  return null;
}

function buildBundle({
  trackerRecords,
  trackerWarnings,
  routeLists,
  routeListWarnings,
  invoicePdfs,
  invoicePdfWarnings,
  args,
}) {
  const records = trackerRecords.map((trackerRecord) => {
    const routeList = routeLists.get(trackerRecord.routeCode);
    const invoicePdfPath = trackerRecord.invoiceNumber
      ? (invoicePdfs.get(normalizeToken(trackerRecord.invoiceNumber)) || null)
      : null;
    const completedAt =
      toIsoDateTime(trackerRecord.lifecycle.paidDate) ||
      toIsoDateTime(trackerRecord.lifecycle.sentDate) ||
      new Date().toISOString();

    const recordWarnings = [];
    const operatorKey = trackerRecord.operatorName ? trackerRecord.operatorName.toLowerCase() : '';
    let resolvedOperator = null;
    if (operatorKey) {
      resolvedOperator = args.operators.get(operatorKey) || null;
      if (!resolvedOperator) {
        recordWarnings.push(
          `Row ${trackerRecord.source.trackerRow}: unknown operator '${trackerRecord.operatorName}' for ${trackerRecord.routeCode} — no operator assigned (pass --operator ${trackerRecord.operatorName}:<sub>:<email>).`
        );
      }
    } else if (args.defaultOperatorName) {
      resolvedOperator = { name: args.defaultOperatorName, sub: args.defaultOperatorSub, email: args.defaultOperatorEmail };
    }

    let payout = null;
    if (trackerRecord.splitAmount !== null) {
      if (resolvedOperator?.sub) {
        payout = {
          operatorSub: resolvedOperator.sub,
          amount: trackerRecord.splitAmount,
          status: trackerRecord.lifecycle.paidDate ? 'paid' : 'pending',
          paidAt: trackerRecord.lifecycle.paidDate ? toIsoDateTime(trackerRecord.lifecycle.paidDate) : undefined,
          notes: `Legacy import split for ${trackerRecord.routeCode}`,
        };
      } else {
        recordWarnings.push(
          `Row ${trackerRecord.source.trackerRow}: split amount present but no operator resolved for ${trackerRecord.routeCode} — payout not created.`
        );
      }
    }

    return {
      importKey: `${trackerRecord.routeCode}::${trackerRecord.invoiceNumber || 'NO-INVOICE'}`,
      customerId: args.customerId,
      route: {
        routeCode: trackerRecord.routeCode,
        status: args.routeStatus,
        completedAt,
        overrideSigns: trackerRecord.summary.signs,
        overrideStops: trackerRecord.summary.stops,
        overrideDistanceKm: trackerRecord.summary.kilometers,
        overrideDurationMinutes: trackerRecord.summary.durationMinutes,
        actualDurationMinutes: trackerRecord.summary.durationMinutes,
        // The Tracker sheet's Jobs tab "Job" column is the summary of the route
        // as recorded by the business at the time — carried through verbatim
        // rather than wrapped in a generic "Legacy import (...)" label.
        notes: trackerRecord.jobLabel || trackerRecord.routeCode,
        assignedOperatorName: resolvedOperator?.name || undefined,
        assignedOperatorSub: resolvedOperator?.sub || undefined,
        assignedOperatorEmail: resolvedOperator?.email || undefined,
        assignedAt: resolvedOperator?.name ? completedAt : undefined,
      },
      invoice: {
        invoiceNumber: trackerRecord.invoiceNumber,
        invoiceDate: trackerRecord.lifecycle.sentDate,
        totalAmount: trackerRecord.summary.amount,
        status: deriveInvoiceStatus(trackerRecord.lifecycle.sentDate, trackerRecord.lifecycle.paidDate),
        sentDate: trackerRecord.lifecycle.sentDate,
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
      payout,
      source: {
        trackerRow: trackerRecord.source.trackerRow,
        routeListFile: routeList ? path.basename(routeList.filePath) : null,
        invoicePdfFile: invoicePdfPath ? path.basename(invoicePdfPath) : null,
        invoicePdfPath,
      },
      warnings: [
        ...(
          args.mode !== 'pdf-only' && !routeList
            ? [`Missing route list CSV for ${trackerRecord.routeCode}`]
            : []
        ),
        ...(
          args.invoicePdfsDir && trackerRecord.invoiceNumber && !invoicePdfPath
            ? [`Missing invoice PDF for ${trackerRecord.invoiceNumber}`]
            : []
        ),
        ...recordWarnings,
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
      invoicePdfsDir: args.invoicePdfsDir || null,
    },
    stats: {
      trackerRows: trackerRecords.length,
      routeListFilesMatched: records.filter((record) => record.source.routeListFile).length,
      routesPrepared: records.length,
      invoicesPrepared: records.filter((record) => record.invoice.invoiceNumber).length,
      stopsPrepared: records.reduce((sum, record) => sum + record.stops.length, 0),
      payoutsPrepared: records.filter((record) => record.payout).length,
      warnings:
        trackerWarnings.length +
        routeListWarnings.length +
        invoicePdfWarnings.length +
        records.reduce((sum, record) => sum + record.warnings.length, 0),
    },
    warnings: [
      ...trackerWarnings,
      ...routeListWarnings,
      ...invoicePdfWarnings,
      ...records.flatMap((record) => record.warnings),
    ],
    records,
  };
}

// AppSync list() with a `filter` runs a DynamoDB scan/query where `limit` caps how many
// items are examined BEFORE the filter is applied, not how many matches are returned. None
// of these models have a secondary index for the fields we filter on, so a small limit (e.g.
// 1) almost always misses real matches once the table has more rows than the limit, silently
// causing "not found" and duplicate creates. Paginate through every page instead.
async function listAllMatching(listFn, input, authMode) {
  const items = [];
  let nextToken;
  do {
    const page = await listFn({ ...input, nextToken }, { authMode });
    items.push(...(page.data || []));
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
}

async function applyBundle(bundle, args) {
  const { Amplify } = await import('aws-amplify');
  const { generateClient } = await import('aws-amplify/data');
  const { signIn, fetchAuthSession } = await import('aws-amplify/auth');
  const { uploadData } = await import('aws-amplify/storage');

  const outputsRaw = fs.readFileSync(args.outputsPath, 'utf8');
  const outputs = JSON.parse(outputsRaw);
  Amplify.configure(outputs);

  let authMode = args.authMode;
  if (authMode === 'userPool') {
    const username = args.username || process.env.IMPORT_PREP_USERNAME;
    const password = args.password || process.env.IMPORT_PREP_PASSWORD;

    if (!username || !password) {
      throw new Error(
        'User Pool auth requires credentials. Set IMPORT_PREP_USERNAME and IMPORT_PREP_PASSWORD or pass --username/--password.'
      );
    }

    await signIn({ username, password });
    const session = await fetchAuthSession();
    if (!session.tokens?.idToken) {
      throw new Error('Sign-in succeeded but no User Pool token is available.');
    }

    const groupsClaim = session.tokens.idToken.payload?.['cognito:groups'];
    const groups = Array.isArray(groupsClaim)
      ? groupsClaim.map((value) => String(value))
      : groupsClaim
      ? [String(groupsClaim)]
      : [];

    if (args.invoicePdfsDir) {
      const canWriteInvoiceStorage = groups.includes('administrator') || groups.includes('operator');
      if (!canWriteInvoiceStorage) {
        throw new Error(
          `Invoice PDF upload requires an administrator/operator account. Signed-in groups: ${groups.join(', ') || 'none'}`
        );
      }
    }
  }

  const client = generateClient();

  const routeCache = new Map();
  const invoiceCache = new Map();
  // customerId -> { viewerSubs, gstExclusive }. viewerSubs is never recomputed
  // here -- it's copied forward from the Customer record, which is already kept
  // in sync elsewhere (customer-access-activation Lambda, lib/queries.ts
  // syncViewerSubsForCustomer) whenever CustomerUser membership changes. Without
  // this, records created by this script would be invisible in the customer
  // portal, since Route/Stop/Invoice/LineItem auth is ownersDefinedIn('viewerSubs')
  // only -- there is no fallback to customerId.
  const customerCache = new Map();

  async function getCustomerContext(customerId) {
    if (customerCache.has(customerId)) {
      return customerCache.get(customerId);
    }
    const { data: customer } = await client.models.Customer.get({ id: customerId }, { authMode });
    const context = {
      viewerSubs: customer?.viewerSubs || [],
      gstExclusive: Boolean(customer?.gstExclusive),
    };
    customerCache.set(customerId, context);
    return context;
  }

  const summary = {
    routesCreated: 0,
    routesUpdated: 0,
    stopsCreated: 0,
    stopsUpdated: 0,
    invoicesCreated: 0,
    invoicesUpdated: 0,
    lineItemsCreated: 0,
    payoutsCreated: 0,
    payoutsUpdated: 0,
    pdfsUploaded: 0,
    pdfsMissing: 0,
    pdfUploadErrors: 0,
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
      const isPdfOnlyMode = args.mode === 'pdf-only';

      if (isPdfOnlyMode) {
        if (!record.invoice.invoiceNumber) {
          continue;
        }

        const invoiceKey = `${record.customerId}::${record.invoice.invoiceNumber}`;
        let invoice = invoiceCache.get(invoiceKey);
        if (!invoice) {
          const invoiceMatches = await listAllMatching(
            client.models.Invoice.list,
            {
              filter: {
                customerId: { eq: record.customerId },
                invoiceNumber: { eq: record.invoice.invoiceNumber },
              },
            },
            authMode
          );
          invoice = invoiceMatches[0] || null;
        }

        if (!invoice?.id) {
          summary.errors.push(`Invoice not found for ${record.importKey}. Run full apply first or verify invoice number.`);
          continue;
        }

        const invoicePdfPath = record.source?.invoicePdfPath;
        if (!invoicePdfPath) {
          summary.pdfsMissing += 1;
          invoiceCache.set(invoiceKey, invoice);
          continue;
        }

        try {
          const s3Key = `invoices/${invoice.id}.pdf`;
          await uploadData({
            path: s3Key,
            data: fs.readFileSync(invoicePdfPath),
            options: { contentType: 'application/pdf' },
          }).result;

          if (invoice.pdfS3Key !== s3Key) {
            const invoiceWithPdf = await client.models.Invoice.update(
              { id: invoice.id, pdfS3Key: s3Key },
              { authMode }
            );
            invoice = invoiceWithPdf.data || invoice;
          }

          summary.pdfsUploaded += 1;
        } catch (pdfError) {
          const pdfMessage = pdfError instanceof Error ? pdfError.message : String(pdfError);
          summary.pdfUploadErrors += 1;
          if (/s3:PutObject/i.test(pdfMessage)) {
            summary.errors.push(
              `${record.importKey}: failed to upload invoice PDF (${pdfMessage}). ` +
              'The signed-in user does not have invoice storage write permission. Use an operator/administrator account and deploy the latest storage policy.'
            );
          } else {
            summary.errors.push(`${record.importKey}: failed to upload invoice PDF (${pdfMessage})`);
          }
        }

        invoiceCache.set(invoiceKey, invoice);
        continue;
      }

      let route = routeCache.get(routeKey);

      if (!route) {
        const routeMatches = await listAllMatching(
          client.models.Route.list,
          {
            filter: {
              customerId: { eq: record.customerId },
              routeCode: { eq: record.route.routeCode },
            },
          },
          authMode
        );
        route = routeMatches[0] || null;
      }

      const customerContext = await getCustomerContext(record.customerId);

      const routePayload = {
        customerId: record.customerId,
        routeCode: record.route.routeCode,
        status: record.route.status,
        viewerSubs: customerContext.viewerSubs,
        // Legacy tracker imports are always field-mode (2-phase) routes, not the
        // driving-mode sign-run flow — explicit false documents that rather than
        // relying on the field being left undefined.
        drivingModeEnabled: false,
        actualStartTime: record.route.status === 'completed' || record.route.status === 'archived' ? record.route.completedAt : undefined,
        actualEndTime: record.route.status === 'completed' || record.route.status === 'archived' ? record.route.completedAt : undefined,
        placementStartTime: record.route.status === 'completed' || record.route.status === 'archived' ? record.route.completedAt : undefined,
        placementEndTime: record.route.status === 'completed' || record.route.status === 'archived' ? record.route.completedAt : undefined,
        pickupStartTime: record.route.status === 'completed' || record.route.status === 'archived' ? record.route.completedAt : undefined,
        pickupEndTime: record.route.status === 'completed' || record.route.status === 'archived' ? record.route.completedAt : undefined,
        overrideSigns: record.route.overrideSigns ?? undefined,
        overrideStops: record.route.overrideStops ?? undefined,
        overrideDistanceKm: record.route.overrideDistanceKm ?? undefined,
        overrideDurationMinutes: record.route.overrideDurationMinutes ?? undefined,
        actualDurationMinutes: record.route.actualDurationMinutes ?? undefined,
        notes: record.route.notes,
        assignedOperatorName: record.route.assignedOperatorName,
        assignedOperatorSub: record.route.assignedOperatorSub,
        assignedOperatorEmail: record.route.assignedOperatorEmail,
        assignedAt: record.route.assignedAt,
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

      const existingStops = await listAllMatching(
        client.models.Stop.list,
        { filter: { routeId: { eq: route.id } } },
        authMode
      );
      const stopMap = new Map(
        existingStops.map((stop) => [`${stop.sequence}|${normalizeAddress(stop.address).toLowerCase()}`, stop])
      );

      for (const stopRecord of record.stops) {
        const stopKey = `${stopRecord.sequence}|${normalizeAddress(stopRecord.address).toLowerCase()}`;
        const existingStop = stopMap.get(stopKey);
        const isTerminalRoute = record.route.status === 'completed' || record.route.status === 'archived';
        const completedAt = record.route.completedAt || new Date().toISOString();
        const stopPayload = {
          routeId: route.id,
          customerId: record.customerId,
          viewerSubs: customerContext.viewerSubs,
          sequence: stopRecord.sequence,
          address: stopRecord.address,
          serviceType: isTerminalRoute ? 'pickup' : stopRecord.serviceType,
          actualArrivalTime: isTerminalRoute ? completedAt : undefined,
          actualDepartureTime: isTerminalRoute ? completedAt : undefined,
          numberOfSigns: stopRecord.numberOfSigns ?? undefined,
          agent: stopRecord.agent ?? undefined,
          isAuction: stopRecord.isAuction ?? undefined,
        };

        if (existingStop?.id) {
          await client.models.Stop.update({ id: existingStop.id, ...stopPayload }, { authMode });
          summary.stopsUpdated += 1;
        } else {
          await client.models.Stop.create(stopPayload, { authMode });
          summary.stopsCreated += 1;
        }
      }

      if (record.payout) {
        const existingPayouts = await listAllMatching(
          client.models.OperatorPayout.list,
          { filter: { routeId: { eq: route.id }, operatorSub: { eq: record.payout.operatorSub } } },
          authMode
        );
        const payoutPayload = {
          operatorSub: record.payout.operatorSub,
          customerId: record.customerId,
          routeId: route.id,
          amount: record.payout.amount,
          status: record.payout.status,
          paidAt: record.payout.paidAt,
          notes: record.payout.notes,
        };

        if (existingPayouts[0]?.id) {
          await client.models.OperatorPayout.update({ id: existingPayouts[0].id, ...payoutPayload }, { authMode });
          summary.payoutsUpdated += 1;
        } else {
          await client.models.OperatorPayout.create(payoutPayload, { authMode });
          summary.payoutsCreated += 1;
        }
      }

      if (!record.invoice.invoiceNumber) {
        continue;
      }

      const invoiceKey = `${record.customerId}::${record.invoice.invoiceNumber}`;
      let invoice = invoiceCache.get(invoiceKey);
      if (!invoice) {
        const invoiceMatches = await listAllMatching(
          client.models.Invoice.list,
          {
            filter: {
              customerId: { eq: record.customerId },
              invoiceNumber: { eq: record.invoice.invoiceNumber },
            },
          },
          authMode
        );
        invoice = invoiceMatches[0] || null;
      }

      const invoicePayload = {
        customerId: record.customerId,
        invoiceNumber: record.invoice.invoiceNumber,
        invoiceDate: record.invoice.invoiceDate || new Date().toISOString().slice(0, 10),
        totalAmount: record.invoice.totalAmount ?? 0,
        // GST applied at issue time -- stored so historical invoices stay accurate
        // if Customer.gstExclusive changes later (see amplify/data/resource.ts).
        ...(customerContext.gstExclusive && record.invoice.totalAmount !== null
          ? { gstAmount: round2(record.invoice.totalAmount * 0.1) }
          : {}),
        status: record.invoice.status,
        routeId: route.id,
        importedAt: new Date().toISOString(),
        viewerSubs: customerContext.viewerSubs,
        ...(record.invoice.sentDate
          ? { emailSentAt: toIsoDateTime(record.invoice.sentDate) }
          : {}),
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

      if (args.invoicePdfsDir && record.invoice.invoiceNumber) {
        const invoicePdfPath = record.source?.invoicePdfPath;
        if (invoicePdfPath) {
          try {
            const s3Key = `invoices/${invoice.id}.pdf`;
            await uploadData({
              path: s3Key,
              data: fs.readFileSync(invoicePdfPath),
              options: { contentType: 'application/pdf' },
            }).result;

            if (invoice.pdfS3Key !== s3Key) {
              const invoiceWithPdf = await client.models.Invoice.update(
                { id: invoice.id, pdfS3Key: s3Key },
                { authMode }
              );
              invoice = invoiceWithPdf.data || invoice;
            }

            summary.pdfsUploaded += 1;
          } catch (pdfError) {
            const pdfMessage = pdfError instanceof Error ? pdfError.message : String(pdfError);
            summary.pdfUploadErrors += 1;
            if (/s3:PutObject/i.test(pdfMessage)) {
              summary.errors.push(
                `${record.importKey}: failed to upload invoice PDF (${pdfMessage}). ` +
                'The signed-in user does not have invoice storage write permission. Use an operator/administrator account and deploy the latest storage policy.'
              );
            } else {
              summary.errors.push(`${record.importKey}: failed to upload invoice PDF (${pdfMessage})`);
            }
          }
        } else {
          summary.pdfsMissing += 1;
        }
      }

      invoiceCache.set(invoiceKey, invoice);

      const existingLineItems = await listAllMatching(
        client.models.LineItem.list,
        {
          filter: {
            invoiceId: { eq: invoice.id },
          },
        },
        authMode
      );

      const hasLegacyLineItem = existingLineItems.some((lineItem) =>
        String(lineItem.description || '').startsWith('Legacy route')
      );

      if (!hasLegacyLineItem && record.lineItem.amount !== null && record.lineItem.ratePerUnit !== null) {
        await client.models.LineItem.create(
          {
            invoiceId: invoice.id,
            routeId: route.id,
            customerId: record.customerId,
            viewerSubs: customerContext.viewerSubs,
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
      const message = error instanceof Error ? error.message : String(error);
      if (/No federated jwt/i.test(message)) {
        summary.errors.push(
          `${record.importKey}: ${message}. Use --auth-mode userPool with an operator/administrator account (set IMPORT_PREP_USERNAME and IMPORT_PREP_PASSWORD).`
        );
      } else {
        summary.errors.push(`${record.importKey}: ${message}`);
      }
    }
  }

  console.log(
    `Apply summary: ${summary.routesCreated} route(s) created, ${summary.routesUpdated} updated; ` +
    `${summary.invoicesCreated} invoice(s) created, ${summary.invoicesUpdated} updated; ` +
    `${summary.stopsCreated} stop(s) created, ${summary.stopsUpdated} updated; ` +
    `${summary.lineItemsCreated} line item(s) created; ` +
    `${summary.payoutsCreated} payout(s) created, ${summary.payoutsUpdated} updated; ` +
    `${summary.pdfsUploaded} PDF(s) uploaded, ${summary.pdfsMissing} missing, ${summary.pdfUploadErrors} upload error(s).`
  );

  return summary;
}

function validateArgs(args) {
  if (!args.tracker || !args.customerId) {
    usage();
    throw new Error('Missing required args: --tracker, --customer-id');
  }

  if (!fs.existsSync(args.tracker)) {
    throw new Error(`Tracker file not found: ${args.tracker}`);
  }

  if (args.mode !== 'pdf-only' && !args.routeListsDir) {
    throw new Error('Missing required args for this mode: --route-lists-dir');
  }

  if (args.routeListsDir && !fs.existsSync(args.routeListsDir)) {
    throw new Error(`Route lists directory not found: ${args.routeListsDir}`);
  }

  if (args.invoicePdfsDir && !fs.existsSync(args.invoicePdfsDir)) {
    throw new Error(`Invoice PDFs directory not found: ${args.invoicePdfsDir}`);
  }

  if (!['dry-run', 'apply', 'pdf-only'].includes(args.mode)) {
    throw new Error(`Unsupported mode '${args.mode}'. Use dry-run, apply, or pdf-only.`);
  }

  if ((args.mode === 'apply' || args.mode === 'pdf-only') && !args.confirmApply) {
    throw new Error('Write modes require --confirm-apply to protect against accidental writes.');
  }

  if (args.mode === 'pdf-only' && !args.invoicePdfsDir) {
    throw new Error('pdf-only mode requires --invoice-pdfs-dir.');
  }

  if (!['completed', 'archived'].includes(args.routeStatus)) {
    throw new Error(`Unsupported route status '${args.routeStatus}'. Use completed or archived.`);
  }

  if (!['userPool', 'iam'].includes(args.authMode)) {
    throw new Error(`Unsupported auth mode '${args.authMode}'. Use userPool or iam.`);
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    validateArgs(args);

    const { records: trackerRecords, warnings: trackerWarnings } = parseTracker(args.tracker);
    const { index: routeLists, warnings: routeListWarnings } = args.routeListsDir
      ? buildRouteListIndex(args.routeListsDir)
      : { index: new Map(), warnings: [] };
    const { index: invoicePdfs, warnings: invoicePdfWarnings } = buildInvoicePdfIndex(args.invoicePdfsDir);

    const bundle = buildBundle({
      trackerRecords,
      trackerWarnings,
      routeLists,
      routeListWarnings,
      invoicePdfs,
      invoicePdfWarnings,
      args,
    });

    if (args.mode === 'apply' || args.mode === 'pdf-only') {
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

if (process.argv[1]?.endsWith('import-prep.js')) {
  void main();
}
