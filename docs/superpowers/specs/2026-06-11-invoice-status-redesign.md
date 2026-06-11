# Invoice Status Redesign

**Date:** 2026-06-11
**Status:** Approved

## Overview

Remove the manual status dropdown from the invoice admin table. Status is now fully inferred from system events: an invoice starts as `draft`, becomes `sent` when emailed, and becomes `paid` when Mark Paid is clicked. Imported invoices (created via `import-prep.js`) are flagged with a new `importedAt` field and are not permitted to have PDFs generated for them. The `emailSentAt` timestamp is surfaced in a new Sent column.

## Data Model (`amplify/data/resource.ts`)

Two changes to the `Invoice` model:

1. **Trim the status enum** — remove `finalized`, keep `draft | sent | paid`.
2. **Add `importedAt: a.datetime()`** — nullable; set to the current ISO timestamp by `import-prep.js` on every invoice create/update. Null for manually created invoices.

```typescript
status: a.enum(['draft', 'sent', 'paid']),
importedAt: a.datetime(),
```

## Migration Script (`scripts/migrate-finalized-status.js`)

One-off script that pages through all Invoice records and updates any with `status === 'finalized'` to `status: 'draft'`. Uses the same Cognito userPool auth pattern as `import-prep.js` (env vars `IMPORT_PREP_USERNAME` / `IMPORT_PREP_PASSWORD`). Idempotent — safe to re-run.

Run once against each environment (branch) after the schema is deployed:

```
node scripts/migrate-finalized-status.js --outputs-path amplify_outputs.json --confirm
```

## `scripts/import-prep.js`

Three targeted changes inside `deriveInvoiceStatus` and `applyBundle`:

1. **`deriveInvoiceStatus`** — return `'draft'` instead of `'finalized'` when neither `sentDate` nor `paidDate` is present.
2. **`emailSentAt` from tracker** — when status resolves to `'sent'`, include `emailSentAt: toIsoDateTime(sentDate)` in the invoice create/update payload.
3. **`importedAt`** — every invoice create/update payload includes `importedAt: new Date().toISOString()`.

## UI Changes

### `InvoiceListTable.tsx`

| Change | Detail |
|--------|--------|
| Remove status dropdown | Delete the `<select>` element and `onSetStatus` prop. |
| Status badge | Existing `statusChip` badge already handles `draft / sent / paid` — no change. |
| Add Sent column | New column between Status and PDF. Shows `formatLocalDateTime(invoice.emailSentAt)` or `—`. Format: `"4 Jun 2025, 2:14 pm"` via `Intl.DateTimeFormat`. |
| PDF generation gate | Render the Generate PDF and Regenerate PDF buttons only when `!invoice.importedAt`. Upload PDF and Replace PDF buttons remain available for imported invoices — modification is permitted, generation is not. |
| Email button label | `invoice.emailSentAt ? 'Resend' : 'Email'`. |
| Imported badge | Render a purple `Imported` chip next to the invoice number when `invoice.importedAt` is set. |

### `page.tsx` (administrator invoices)

- Remove the `setStatus` function and `onSetStatus` prop wiring.
- `handleMarkPaid` keeps its direct `updateInvoice(id, { status: 'paid' })` call — no change needed.

## `lib/queries.ts`

- `InvoiceStatus` type: remove `'finalized'`, type becomes `'draft' | 'sent' | 'paid'`.
- Add `importedAt` to selected fields in `listInvoices`, `getInvoiceWithLineItems`, and `listMyInvoices`.
- `updateInvoice` accepts a partial payload — no signature change required; callers pass `importedAt` where needed.

## Status Transition Rules (summary)

| Trigger | Status transition | Side effect |
|---------|------------------|-------------|
| Invoice created via form | — | `status: 'draft'` |
| Invoice created via import-prep | — | `status` derived from tracker; `importedAt` set |
| Email sent (`send-invoice-email` API) | `* → 'sent'` | `emailSentAt` set (already implemented) |
| Mark Paid clicked | `* → 'paid'` | — |

The `send-invoice-email` route already sets both `status: 'sent'` and `emailSentAt` — no changes required there.

## Out of Scope

- Customer portal invoice detail view — status badge already renders correctly for the three new values; no changes needed.
- PDF generation logic itself — unchanged; only the button visibility is gated.
- Re-enabling PDF generation for imported invoices if a PDF is later uploaded — out of scope; once imported, the flag is permanent.

