# Invoice Status Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual invoice status dropdown with system-inferred status (draft → sent → paid), surface `emailSentAt` as a Sent column, and block PDF generation for invoices imported via `import-prep.js`.

**Architecture:** Add `importedAt: datetime` to the Invoice schema to flag imported records. Trim the status enum from four values to three (removing `finalized`). Gate the Generate/Regenerate PDF buttons in `InvoiceListTable` on `!invoice.importedAt`. Remove `onSetStatus` from the UI entirely — status is now written only by the email API route (→ sent) and the Mark Paid handler (→ paid). A one-off migration script clears any existing `finalized` records to `draft`.

**Tech Stack:** Amplify Gen 2 (AppSync + DynamoDB), Next.js 14 App Router, TypeScript, Jest, CSS Modules

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `amplify/data/resource.ts` | Modify | Trim enum, add `importedAt` field |
| `app/administrator/invoices/types.ts` | Modify | Update `InvoiceStatus`, add `importedAt` to `Invoice` |
| `lib/queries.ts` | Modify | Update status union types, add `importedAt` to update/create payloads |
| `app/administrator/invoices/components/InvoiceListTable.tsx` | Modify | Remove dropdown, add Sent column + Imported badge, gate PDF buttons |
| `app/administrator/invoices/page.module.css` | Modify | Add `.importedBadge` style |
| `app/administrator/invoices/page.tsx` | Modify | Remove `setStatus`/`onSetStatus`, inline Mark Paid logic |
| `scripts/import-prep.js` | Modify | `deriveInvoiceStatus` → `'draft'`; add `importedAt` + `emailSentAt` to payloads |
| `scripts/migrate-finalized-status.js` | Create | One-off migration: finalized → draft |

---

## Task 1: Update the Amplify data schema

**Files:**
- Modify: `amplify/data/resource.ts` (line 171 — status enum; after line 172 — new field)

- [ ] **Step 1: Edit `amplify/data/resource.ts`**

  Find the Invoice model status field (currently line 171) and add `importedAt` on the next line:

  ```typescript
  // Before
  status: a.enum(['draft', 'finalized', 'sent', 'paid']),

  // After
  status: a.enum(['draft', 'sent', 'paid']),
  importedAt: a.datetime(),
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npm run typecheck
  ```

  Expected: no errors. If you see errors about `'finalized'` being an invalid value, that is expected — they will be fixed in Task 2.

- [ ] **Step 3: Commit**

  ```bash
  git add amplify/data/resource.ts
  git commit -m "feat: trim invoice status enum and add importedAt field"
  ```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `app/administrator/invoices/types.ts`
- Modify: `lib/queries.ts`

- [ ] **Step 1: Update `app/administrator/invoices/types.ts`**

  Replace the full file content with:

  ```typescript
  export type CustomerOption = {
    id: string;
    name: string;
    email?: string;
    primaryEmail?: string;
    addressLine1?: string;
    billingRatePerHour?: number;
  };

  export type InvoiceStatus = 'draft' | 'sent' | 'paid';

  export type Invoice = {
    id: string;
    invoiceNumber: string;
    createdAt?: string | null;
    invoiceDate?: string | null;
    customerId: string;
    routeId?: string | null;
    pdfS3Key?: string | null;
    totalAmount: number;
    status?: InvoiceStatus | null;
    emailSentAt?: string | null;
    importedAt?: string | null;
  };
  ```

- [ ] **Step 2: Update status union types in `lib/queries.ts`**

  Search for every occurrence of `'draft' | 'finalized' | 'sent' | 'paid'` in `lib/queries.ts` — there are three:
  - The `status` filter option in `listInvoices`
  - The `status` field in the `createInvoice` input type
  - The `status` field in the `updateInvoice` updates type

  For each, change to `'draft' | 'sent' | 'paid'`.

  Also add `importedAt?: string` to the `updateInvoice` updates partial type, and `importedAt?: string` to the `createInvoice` input type:

  ```typescript
  // updateInvoice — find the Partial<{...}> block and add:
  importedAt?: string;

  // createInvoice — find the input: {...} block and add:
  importedAt?: string;
  ```

- [ ] **Step 3: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors (the `finalized` references in `import-prep.js` are plain JS strings and won't cause TS errors).

- [ ] **Step 4: Commit**

  ```bash
  git add app/administrator/invoices/types.ts lib/queries.ts
  git commit -m "feat: remove finalized from InvoiceStatus, add importedAt to Invoice type"
  ```

---

## Task 3: Update `InvoiceListTable` — remove dropdown, add Sent column and Imported badge, gate PDF buttons

**Files:**
- Modify: `app/administrator/invoices/components/InvoiceListTable.tsx`
- Modify: `app/administrator/invoices/page.module.css`

- [ ] **Step 1: Write a failing test for `formatLocalDateTime`**

  Create `app/administrator/invoices/components/__tests__/InvoiceListTable.test.ts`:

  ```typescript
  import { formatLocalDateTime } from '../InvoiceListTable';

  describe('formatLocalDateTime', () => {
    it('returns — for null', () => {
      expect(formatLocalDateTime(null)).toBe('—');
    });

    it('returns — for undefined', () => {
      expect(formatLocalDateTime(undefined)).toBe('—');
    });

    it('formats a valid ISO datetime string', () => {
      const result = formatLocalDateTime('2025-06-04T04:14:00.000Z');
      expect(result).toMatch(/Jun/);
      expect(result).toMatch(/2025/);
    });
  });
  ```

- [ ] **Step 2: Run the test to confirm it fails**

  ```bash
  npx jest InvoiceListTable.test --no-coverage
  ```

  Expected: FAIL — `formatLocalDateTime` is not exported yet.

- [ ] **Step 3: Add `.importedBadge` to `app/administrator/invoices/page.module.css`**

  Append to the end of the file:

  ```css
  .importedBadge {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 5px;
    border-radius: 3px;
    background: #1e1a2e;
    border: 1px solid #4c3d7a;
    color: #a78bfa;
    font-size: 10px;
    font-weight: 600;
    vertical-align: middle;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  ```

- [ ] **Step 4: Update `InvoiceListTable.tsx`**

  Make the following changes to the file:

  **4a — Remove `onSetStatus` from the props interface (lines 11–28) and add `formatLocalDateTime` as an exported helper before the component:**

  Remove this line from the interface:
  ```typescript
  onSetStatus: (invoiceId: string, status: InvoiceStatus) => void;
  ```

  Add this exported function above the component (after the `getStatusChipClass` function):

  ```typescript
  export function formatLocalDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  }
  ```

  **4b — Remove the `statusChipFinalized` case from `getStatusChipClass`:**

  Find the `getStatusChipClass` function (lines 36–47) and remove the `finalized` branch:

  ```typescript
  // Remove this line:
  if (normalStatus === 'finalized') return `${invoiceStyles.statusChip} ${invoiceStyles.statusChipFinalized}`;
  ```

  **4c — Replace the status `<select>` with a read-only badge:**

  Replace lines 130–140 (the entire `<select>` block):
  ```typescript
  // Remove entirely:
  <select
    value={invoice.status ?? 'draft'}
    onChange={(event) => onSetStatus(invoice.id, event.target.value as InvoiceStatus)}
    className={invoiceStyles.cellSelect}
    aria-label={`Status for invoice ${invoice.invoiceNumber}`}
  >
    <option value="draft">draft</option>
    <option value="finalized">finalized</option>
    <option value="sent">sent</option>
    <option value="paid">paid</option>
  </select>
  ```

  Replace with:
  ```typescript
  <span className={getStatusChipClass(invoice.status)}>
    {toTitleCase(invoice.status ?? 'draft')}
  </span>
  ```

  **4d — Add a "Sent" table header after the Status header:**

  Find the `<th>` for Status and add a Sent column immediately after it:
  ```tsx
  <th>Sent</th>
  ```

  **4e — Add a "Sent" table data cell after the Status cell in each row:**

  After the status badge cell, add:
  ```tsx
  <td className={invoiceStyles.sentCell}>
    {formatLocalDateTime(invoice.emailSentAt)}
  </td>
  ```

  **4f — Add the Imported badge next to the invoice number:**

  Find where `invoice.invoiceNumber` is rendered in the first `<td>` and wrap it with:
  ```tsx
  <td>
    {invoice.invoiceNumber}
    {invoice.importedAt && (
      <span className={invoiceStyles.importedBadge}>Imported</span>
    )}
  </td>
  ```

  **4g — Gate "Generate PDF" button on `!invoice.importedAt`:**

  In the "PDF Missing" block (around line 192–217), wrap the Generate PDF button:
  ```tsx
  {!invoice.importedAt && (
    <AdminActionButton
      className={invoiceStyles.uploadButton}
      variant="primary"
      onClick={() => onGeneratePdf(invoice)}
      isLoading={uploadingId === invoice.id}
      loadingLabel="Generating..."
      aria-label={`Generate PDF for invoice ${invoice.invoiceNumber}`}
    >
      Generate PDF
    </AdminActionButton>
  )}
  ```

  **4h — Gate "Regenerate" button on `!invoice.importedAt`:**

  In the `AdminRowMenu` inside the "PDF Attached" block, wrap the Regenerate button:
  ```tsx
  {!invoice.importedAt && (
    <AdminActionButton
      className={invoiceStyles.inlineButton}
      variant="secondary"
      onClick={() => handleRegeneratePdf(invoice)}
      isLoading={uploadingId === invoice.id}
      loadingLabel="Generating..."
      disabled={pdfActionLoadingId === invoice.id}
      aria-label={`Regenerate PDF for invoice ${invoice.invoiceNumber}`}
    >
      Regenerate
    </AdminActionButton>
  )}
  ```

  **4i — Change Email button label to "Resend" when already sent:**

  Find the Email button in the Actions column and update its label:
  ```tsx
  {invoice.emailSentAt ? 'Resend' : 'Email'}
  ```

  Also update the `aria-label`:
  ```tsx
  aria-label={`${invoice.emailSentAt ? 'Resend' : 'Email'} invoice ${invoice.invoiceNumber}`}
  ```

  **4j — Remove `InvoiceStatus` import if no longer used in this file:**

  Check the import line at the top of the file. If `InvoiceStatus` is only used by the removed `onSetStatus` prop, remove it from the import.

- [ ] **Step 5: Run the test to confirm it passes**

  ```bash
  npx jest InvoiceListTable.test --no-coverage
  ```

  Expected: PASS — all three `formatLocalDateTime` tests green.

- [ ] **Step 6: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add app/administrator/invoices/components/InvoiceListTable.tsx \
          app/administrator/invoices/components/__tests__/InvoiceListTable.test.ts \
          app/administrator/invoices/page.module.css
  git commit -m "feat: replace status dropdown with badge, add Sent column and Imported badge, gate PDF generation"
  ```

---

## Task 4: Update `page.tsx` — remove `setStatus` / `onSetStatus`

**Files:**
- Modify: `app/administrator/invoices/page.tsx`

- [ ] **Step 1: Remove `setStatus` and inline the Mark Paid logic**

  Find and delete the `setStatus` function (lines 167–171):
  ```typescript
  // Delete this entire function:
  const setStatus = async (id: string, status: InvoiceStatus) => {
    const result = await updateInvoice(id, { status });
    if (result.errors && result.errors.length > 0) { setError('Failed to update status.'); return; }
    updateInvoiceInState(id, { status });
  };
  ```

  Replace the `handleMarkPaid` function with an inlined version:
  ```typescript
  const handleMarkPaid = async (invoiceId: string) => {
    const result = await updateInvoice(invoiceId, { status: 'paid' });
    if (result.errors && result.errors.length > 0) { setError('Failed to update status.'); return; }
    updateInvoiceInState(invoiceId, { status: 'paid' });
  };
  ```

- [ ] **Step 2: Remove `onSetStatus` prop from `<InvoiceListTable>`**

  Find the `<InvoiceListTable>` usage (around lines 262–264) and delete the `onSetStatus` prop:
  ```typescript
  // Delete this prop:
  onSetStatus={(invoiceId, status) => {
    void setStatus(invoiceId, status);
  }},
  ```

- [ ] **Step 3: Remove unused `InvoiceStatus` import**

  If `InvoiceStatus` is no longer referenced in `page.tsx` after the above removals, remove it from the import at the top of the file:
  ```typescript
  // Before (line ~19):
  import type { Invoice, InvoiceStatus } from '@/app/administrator/invoices/types';

  // After:
  import type { Invoice } from '@/app/administrator/invoices/types';
  ```

- [ ] **Step 4: Run typecheck and build**

  ```bash
  npm run typecheck && npm run build
  ```

  Expected: no errors, build succeeds.

- [ ] **Step 5: Commit**

  ```bash
  git add app/administrator/invoices/page.tsx
  git commit -m "feat: remove manual status dropdown wiring from invoice admin page"
  ```

---

## Task 5: Update `import-prep.js`

**Files:**
- Modify: `scripts/import-prep.js`

- [ ] **Step 1: Write a failing test for `deriveInvoiceStatus`**

  Create `scripts/__tests__/import-prep.test.js`:

  ```javascript
  import { deriveInvoiceStatus } from '../import-prep.js';

  describe('deriveInvoiceStatus', () => {
    it('returns paid when paidDate is set', () => {
      expect(deriveInvoiceStatus('2025-01-01', '2025-02-01')).toBe('paid');
    });

    it('returns sent when only sentDate is set', () => {
      expect(deriveInvoiceStatus('2025-01-01', null)).toBe('sent');
    });

    it('returns draft when neither date is set', () => {
      expect(deriveInvoiceStatus(null, null)).toBe('draft');
    });

    it('returns draft when both dates are empty strings', () => {
      expect(deriveInvoiceStatus('', '')).toBe('draft');
    });
  });
  ```

  > Note: For this test to work, `deriveInvoiceStatus` must be exported. It is currently not — you will fix that in Step 3.

- [ ] **Step 2: Run the test to confirm it fails**

  ```bash
  npx jest import-prep.test --no-coverage
  ```

  Expected: FAIL — `deriveInvoiceStatus` is not exported.

- [ ] **Step 3: Make `import-prep.js` safely importable — add argv guard around `main()` call**

  The file currently ends with `void main();` (line 1034), which executes immediately on import and would break the test. Change it to:

  ```javascript
  // Before (line 1034):
  void main();

  // After:
  if (process.argv[1]?.endsWith('import-prep.js')) {
    void main();
  }
  ```

- [ ] **Step 4: Update `deriveInvoiceStatus` in `scripts/import-prep.js` (lines 463–467)**

  ```javascript
  // Before:
  function deriveInvoiceStatus(sentDate, paidDate) {
    if (paidDate) return 'paid';
    if (sentDate) return 'sent';
    return 'finalized';
  }

  // After:
  export function deriveInvoiceStatus(sentDate, paidDate) {
    if (paidDate) return 'paid';
    if (sentDate) return 'sent';
    return 'draft';
  }
  ```

- [ ] **Step 5: Add `sentDate` to the bundle invoice object in `buildBundle` (lines 515–520)**

  ```javascript
  // Before:
  invoice: {
    invoiceNumber: trackerRecord.invoiceNumber,
    invoiceDate: trackerRecord.lifecycle.sentDate,
    totalAmount: trackerRecord.summary.amount,
    status: deriveInvoiceStatus(trackerRecord.lifecycle.sentDate, trackerRecord.lifecycle.paidDate),
  },

  // After:
  invoice: {
    invoiceNumber: trackerRecord.invoiceNumber,
    invoiceDate: trackerRecord.lifecycle.sentDate,
    totalAmount: trackerRecord.summary.amount,
    status: deriveInvoiceStatus(trackerRecord.lifecycle.sentDate, trackerRecord.lifecycle.paidDate),
    sentDate: trackerRecord.lifecycle.sentDate,
  },
  ```

- [ ] **Step 6: Add `importedAt` and `emailSentAt` to `invoicePayload` in `applyBundle` (lines 829–835)**

  ```javascript
  // Before:
  const invoicePayload = {
    customerId: record.customerId,
    invoiceNumber: record.invoice.invoiceNumber,
    invoiceDate: record.invoice.invoiceDate || new Date().toISOString().slice(0, 10),
    totalAmount: record.invoice.totalAmount ?? 0,
    status: record.invoice.status,
    routeId: route.id,
  };

  // After:
  const invoicePayload = {
    customerId: record.customerId,
    invoiceNumber: record.invoice.invoiceNumber,
    invoiceDate: record.invoice.invoiceDate || new Date().toISOString().slice(0, 10),
    totalAmount: record.invoice.totalAmount ?? 0,
    status: record.invoice.status,
    routeId: route.id,
    importedAt: new Date().toISOString(),
    ...(record.invoice.status === 'sent' && record.invoice.sentDate
      ? { emailSentAt: toIsoDateTime(record.invoice.sentDate) }
      : {}),
  };
  ```

- [ ] **Step 6: Run the test to confirm it passes**

  ```bash
  npx jest import-prep.test --no-coverage
  ```

  Expected: PASS — all four `deriveInvoiceStatus` tests green.

- [ ] **Step 7: Commit**

  ```bash
  git add scripts/import-prep.js scripts/__tests__/import-prep.test.js
  git commit -m "feat: update import-prep to set importedAt, emailSentAt, and remove finalized status"
  ```

---

## Task 6: Write migration script

**Files:**
- Create: `scripts/migrate-finalized-status.js`

- [ ] **Step 1: Write a failing test**

  Create `scripts/__tests__/migrate-finalized-status.test.js`:

  ```javascript
  import { collectFinalized } from '../migrate-finalized-status.js';

  describe('collectFinalized', () => {
    it('returns only finalized records from a page', () => {
      const records = [
        { id: '1', invoiceNumber: 'INV-001', status: 'finalized' },
        { id: '2', invoiceNumber: 'INV-002', status: 'draft' },
        { id: '3', invoiceNumber: 'INV-003', status: 'finalized' },
        { id: '4', invoiceNumber: 'INV-004', status: 'paid' },
      ];
      expect(collectFinalized(records)).toEqual([
        { id: '1', invoiceNumber: 'INV-001', status: 'finalized' },
        { id: '3', invoiceNumber: 'INV-003', status: 'finalized' },
      ]);
    });

    it('returns empty array when no finalized records', () => {
      expect(collectFinalized([{ id: '1', status: 'draft' }])).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run the test to confirm it fails**

  ```bash
  npx jest migrate-finalized-status.test --no-coverage
  ```

  Expected: FAIL — `collectFinalized` is not exported yet.

- [ ] **Step 3: Create `scripts/migrate-finalized-status.js`**

  ```javascript
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
  ```

- [ ] **Step 4: Run the test to confirm it passes**

  ```bash
  npx jest migrate-finalized-status.test --no-coverage
  ```

  Expected: PASS — both `collectFinalized` tests green.

- [ ] **Step 5: Run full test suite**

  ```bash
  npm run test:ci
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/migrate-finalized-status.js scripts/__tests__/migrate-finalized-status.test.js
  git commit -m "feat: add migrate-finalized-status script"
  ```

---

## Task 7: Run migration against deployed environments

This task is performed manually after each environment's schema is deployed.

- [ ] **Step 1: Deploy the schema changes**

  Push the branch to Amplify Console and wait for the backend deploy to complete (this updates the AppSync schema and DynamoDB tables to include `importedAt` and the trimmed enum).

- [ ] **Step 2: Run the migration in dry-run mode first**

  ```bash
  IMPORT_PREP_USERNAME=admin@nulldevice.dev \
  IMPORT_PREP_PASSWORD=<password> \
  node scripts/migrate-finalized-status.js \
    --outputs-path amplify_outputs.json
  ```

  Expected output: lists each `finalized` record that would be updated. Review the list.

- [ ] **Step 3: Apply the migration**

  ```bash
  IMPORT_PREP_USERNAME=admin@nulldevice.dev \
  IMPORT_PREP_PASSWORD=<password> \
  node scripts/migrate-finalized-status.js \
    --outputs-path amplify_outputs.json \
    --confirm
  ```

  Expected: `Migration complete. Updated: N, Failed: 0`

---

## Post-Implementation Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run test:ci` passes
- [ ] `npm run build` succeeds
- [ ] Invoice list renders: status badge shows, no dropdown
- [ ] Sent column shows formatted date for emailed invoices, `—` otherwise
- [ ] Imported badge appears on records with `importedAt` set
- [ ] Generate PDF button absent for imported invoices; present for manual invoices
- [ ] Regenerate button absent for imported invoices; present for manual invoices with PDFs
- [ ] Mark Paid still works and transitions status to `paid`
- [ ] Email/Resend button label updates correctly after sending
- [ ] Migration script dry-run lists expected records before `--confirm`


