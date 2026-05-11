# nd-assets - Delivery Management System

A serverless delivery management platform built with Next.js 15, AWS Amplify Gen 2, and Cognito. It includes administrator, operator, and customer portals, route planning and stop management, and invoice workflows with SES email delivery.

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

- Role-aware login with branded Amplify Authenticator and pending-approval flow.
- Multi-role selection screen when a user belongs to more than one group.
- Route management with:
	- Import flow that prioritizes Copy Stops From Previous Route.
	- Optional schedule-file upload parsing (PDF/CSV/TXT).
	- Preview gating that only activates when stops were copied or successfully parsed.
- Invoice management with:
	- PDF upload and auto-parse support.
	- SES-backed email delivery through API route `/api/admin/send-invoice-email`.
	- `emailSentAt` tracking on invoices.
- Administrator dashboard cards for route stats and invoice email metrics (including Emails Sent Today and Unsent Invoices).
- Customer-user assignment model (`account_owner` / `read_only`) with first-user assignment support.

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

Amplify Data schema currently defines 9 primary entities:

- Customer
- Operator
- Route
- Stop
- Invoice
- LineItem
- PaymentRecord
- AuditLog
- CustomerUser

## Getting Started

### Prerequisites

- Node.js 20+
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

Notes:

- If `SES_SENDER_EMAIL` is not set, API falls back to `no-reply.nulldevice.dev`.
- Verify sender identity/domain in SES for the configured region.

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
	operator/
	customer/
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
