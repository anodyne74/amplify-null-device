[![CI/CD Pipeline](https://github.com/anodyne74/amplify-null-device/actions/workflows/ci.yml/badge.svg)](https://github.com/anodyne74/amplify-null-device/actions/workflows/ci.yml)

# nd-assets - Delivery Management System

A serverless delivery management platform built with Next.js 15, AWS Amplify Gen 2, and Cognito. It includes role-aware administrator, operator, and customer portals, route planning and execution workflows, customer-specific dashboards, and invoice management with SES email delivery.

## Overview

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 18, TypeScript |
| Hosting | AWS Amplify Hosting + CloudFront |
| Authentication | AWS Cognito User Pools |
| API | AWS AppSync (GraphQL via Amplify Data) |
| Database | Amazon DynamoDB (Amplify-managed models) |
| CI/CD | GitHub Actions + Amplify Console |

## Current Features

- Role-aware login with branded Amplify Authenticator, request-access signup, pending approval, and multi-role portal selection.
- Administrator, operator, and customer portals each run on their own shell (`AdminShell`, `OperatorShell`, `CustomerShell`) with a shared navy staff-chrome look, collapsible mobile sidebar, and safe-area-aware bottom padding.
- Administrator portal with dashboard KPIs, customer management, user management, route management, invoice management, and settings.
- Route management with create/edit/detail flows, customer-aware listings, status filtering, and support for copying stops from a previous route or importing schedule files. Route creation is blocked on any date either the operator (no drivers available) or the customer (agency closed) has marked out on the service calendar.
- Operator portal with a phone-friendly dashboard for planned and active routes, a legacy route detail flow for stop execution and map-based route review, and a five-phase Driver Sign Run flow (Load → Placement → Pickup → Unload → Finalise) for routes with `drivingModeEnabled`, covering van sign counts, placement/pickup progression with missing-sign tracking, and billing finalisation.
- Customer portal with dashboard analytics, route history, invoice listing, and user settings.
- Customer access controls with `account_owner` and `read_only` roles, where invoice access is restricted to the account owner; both roles can add route instructions.
- Invoice management with PDF upload and parsing support, SES-backed email delivery through `/api/admin/send-invoice-email`, and `emailSentAt` tracking on invoices.
- Route and stop maps with numbered markers, service-aware coloring, and multiple map style options.
- Customer-user assignment support with first-user assignment handling.

Notes:

- Some third-party tile styles require provider API keys in their tile URL configuration for production use.

## User Groups

Create these Cognito groups in your User Pool:

| Group | Purpose |
|---|---|
| `administrator` | Full administration access |
| `operator` | Operations access |
| `customer` | Customer portal access |

After sign-in:

- Single-role users are redirected automatically.
- Multi-role users choose a destination portal.
- Users with no portal role are sent to pending approval.

## Data Model

Amplify Data schema currently defines 17 entities:

- Customer
- Operator
- Route
- Stop
- Invoice
- LineItem
- PaymentRecord
- AuditLog
- CustomerUser
- Administrator
- UserSettings
- OrganizationSettings
- OperatorAvailabilityBlock
- CustomerClosureBlock
- RateLine
- OperatorPayout
- VanSignCount

## Getting Started

### Prerequisites

- Node.js 22+
- AWS CLI v2
- AWS account in `ap-southeast-2` (or adjust region settings consistently)

### Local Setup

```bash
git clone https://github.com/anodyne74/amplify-null-device.git
cd amplify-null-device

npm ci
npm run generate:config
npm run dev
```

App URL: `http://localhost:3000`

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint checks |
| `npm run typecheck` | TypeScript checks |
| `npm run test` | Jest watch mode |
| `npm run test:ci` | Jest CI run with coverage |
| `npm run generate:config` | Generate local `amplify_outputs.json` |
| `npm run validate:amplify-outputs` | Validate generated Amplify outputs |
| `npm run import:prep` | Prepare or apply a legacy tracker + route-list import bundle |

## Configuration

### amplify_outputs.json

`amplify_outputs.json` is generated and should not be manually edited. For local work:

```bash
npm run generate:config
```

### Amplify Environment Variables

Set these in Amplify Console for builds/runtime:

| Variable | Description |
|---|---|
| `AMPLIFY_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `AMPLIFY_COGNITO_CLIENT_ID` | Cognito App Client ID |
| `AMPLIFY_IDENTITY_POOL_ID` | Cognito Identity Pool ID |
| `AWS_REGION` | AWS region (for example `ap-southeast-2`) |
| `SES_SENDER_EMAIL` | Sender used by SES invoice email API |
| `SES_INVOICE_TEMPLATE_NAME` | SES template name for invoice emails (default: branch-scoped, e.g. `NullDeviceInvoiceTemplate-main`) |

Notes:

- If `SES_SENDER_EMAIL` is not set, API falls back to `no-reply.nulldevice.dev`.
- If `SES_INVOICE_TEMPLATE_NAME` is not set, API uses a branch-scoped default (`NullDeviceInvoiceTemplate-${AWS_BRANCH}` when `AWS_BRANCH`/`AMPLIFY_BRANCH` is available, otherwise `NullDeviceInvoiceTemplate`).
- Verify sender identity/domain in SES for the configured region.
- The SES template is provisioned by Amplify backend deployment in `amplify/backend.ts`.

## Legacy Import

Use `scripts/import-prep.js` to turn a historical tracker CSV plus matching route-list CSVs into an import bundle, or to apply that bundle directly into Amplify Data.

The tracker file should use the meaningful A-K columns only. Any calculated columns after K are ignored.

Example dry run:

```bash
npm run import:prep -- \
	--tracker "/home/dave/Downloads/Tracker - Jobs.csv" \
	--route-lists-dir "/home/dave/Downloads/route-lists" \
	--customer-id "YOUR_CUSTOMER_ID" \
	--mode dry-run \
	--output legacy-import-bundle.json
```

Example apply run:

```bash
export IMPORT_PREP_USERNAME="operator-or-admin@example.com"
export IMPORT_PREP_PASSWORD="your-password"

npm run import:prep -- \
	--tracker "/home/dave/Downloads/Tracker - Jobs.csv" \
	--route-lists-dir "/home/dave/Downloads/route-lists" \
	--invoice-pdfs-dir "/home/dave/Downloads/invoice-pdfs" \
	--customer-id "YOUR_CUSTOMER_ID" \
	--mode apply \
	--confirm-apply \
	--auth-mode userPool \
	--outputs-path amplify_outputs.json
```

Example PDF-only rerun (no route/stop/invoice recalculation):

```bash
export IMPORT_PREP_USERNAME="operator-or-admin@example.com"
export IMPORT_PREP_PASSWORD="your-password"

npm run import:prep -- \
	--tracker "/home/dave/Downloads/Tracker - Jobs.csv" \
	--invoice-pdfs-dir "/home/dave/Downloads/invoice-pdfs" \
	--customer-id "YOUR_CUSTOMER_ID" \
	--mode pdf-only \
	--confirm-apply \
	--auth-mode userPool \
	--outputs-path amplify_outputs.json
```

Optional auth flags:

```bash
--auth-mode userPool|iam
--username "operator-or-admin@example.com"
--password "your-password"
```

Notes:

- The script matches route-list files by route code in the filename, such as `W23-26-001 - Route List - Route.csv`.
- The tracker export uses the second tab in the workbook, which should be the `Jobs` sheet.
- If a route-list file is missing, the bundle still generates and adds a warning for that route.
- If `--invoice-pdfs-dir` is provided, the importer matches PDFs by invoice number (for example `INV-001.pdf`) and uploads them to `invoices/{invoiceId}.pdf`, then saves `pdfS3Key` on the invoice record.
- PDF upload requires a signed-in Cognito user in `operator` or `administrator` group with current storage write permissions deployed.
- Apply mode upserts routes, stops, invoices, and a legacy line item for each invoice when the imported totals are available.
- `pdf-only` mode only uploads matched invoice PDFs and updates `pdfS3Key` on existing invoices.
- Apply mode requires `--confirm-apply` so writes cannot happen accidentally.
- In an interactive terminal, apply mode also asks for a final `yes` confirmation before writing.
- The current importer defaults stop service types to `delivery`.
- Apply mode now defaults to `--auth-mode userPool` and requires a signed-in Cognito operator/administrator account.
- If you see `No federated jwt`, you are using IAM/federated auth without valid identity credentials; switch to `--auth-mode userPool` and provide `IMPORT_PREP_USERNAME` / `IMPORT_PREP_PASSWORD`.

## Deployment

### Recommended

```bash
./deploy-to-uat.sh
```

### Amplify Console

1. Connect repository `anodyne74/amplify-null-device`.
2. Choose your target branch.
3. Ensure required environment variables are set.
4. Deploy.

### Build/Deploy Pipeline Notes

- Amplify backend build uses `npx ampx pipeline-deploy --app-id "$AWS_APP_ID" --branch "$AWS_BRANCH"`.
- Frontend artifacts are served from `.next` (not `out`).

## Project Structure

```text
amplify/
	auth/resource.ts
	data/resource.ts
	storage/resource.ts
	backend.ts

app/
	page.tsx                      # branded login + role routing
	layout.tsx                    # Authenticator.Provider wrapper
	administrator/
		dashboard/
		routes/
		invoices/
		customers/
		users/
		settings/
	operator/
		dashboard/
		routes/
		settings/
	customer/
		dashboard/
		routes/
		invoices/
		settings/
	api/admin/send-invoice-email/route.ts

lib/
scripts/
amplify.yml
```

## Troubleshooting

| Symptom | Likely Cause | Action |
|---|---|---|
| Auth not configured | Placeholder/missing `amplify_outputs.json` or env vars | Run `npm run generate:config` locally and verify Amplify env vars |
| Invoice email fails | SES sender not verified or missing config | Verify SES identity and `SES_SENDER_EMAIL` |
| Upload parse yields no stops | File text extraction/parsing failed | Use a selectable-text PDF/CSV/TXT and retry Preview Stops |
| Build artifact errors in Amplify | Wrong output directory | Confirm Amplify base directory is `.next` |

## Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and PR guidance.
