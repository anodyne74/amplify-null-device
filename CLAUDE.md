# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Role-based delivery management system built on **Next.js 15 + AWS Amplify Gen 2**. Three user portals (administrator, operator, customer) with role-gated access enforced at both the AppSync authorization layer and the React component level.

## Commands

```bash
npm ci                    # Install dependencies
npm run generate:config   # Create local amplify_outputs.json (uses placeholder values)
npm run dev               # Start Next.js dev server at localhost:3000
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
npm run test              # Jest watch mode
npm run test:ci           # Jest CI mode with coverage (used in GitHub Actions)
```

To run a single test file:
```bash
npx jest path/to/file.test.ts
```

## Architecture

### Infrastructure

All backend infrastructure is TypeScript in `amplify/` (Amplify Gen 2 / CDK). **Never use `amplify pull`** — that is a Gen 1 command.

| Layer | Technology |
|---|---|
| Auth | AWS Cognito — email login, 3 groups: `customer`, `operator`, `administrator` |
| API | AWS AppSync (GraphQL, Amplify Data) |
| Database | Amazon DynamoDB — 9 models |
| Storage | Amazon S3 — `/invoices/*` and `/schedules/*` paths |
| Email | AWS SES — templated invoice emails, inbound email forwarding Lambda |
| Hosting | AWS Amplify + CloudFront |

Backend resources are **branch-scoped** — each branch gets isolated AWS resources with branch-suffixed names.

### CI/CD Flow

```
git push → GitHub Actions (quality gates only) → Amplify Console (build + deploy)
```

GitHub Actions requires no AWS credentials. Amplify Console handles deployment when a push lands on a connected branch. The build spec is in `amplify.yml`.

`amplify_outputs.json` is generated at build time and is **not committed**. Locally, `npm run generate:config` creates it with placeholder values.

### Authorization Model

Authorization is enforced at the AppSync model level in `amplify/data/resource.ts`:

- **customer** — reads own data scoped by `customerId == user.sub`; `CustomerUser` records define sub-roles (`account_owner` reads invoices, `read_only` reads routes/stops only)
- **operator** — full CRUD on all models; read/create AuditLog
- **administrator** — full access including user management and system settings

Cognito groups are created post-deployment via `scripts/ensure-cognito-groups.js`. Group membership is read from the ID token (`cognito:groups`). After adding a user to a group, they must log out and back in for the token to refresh.

### Role Helpers and Auth Patterns

Use helpers in `lib/amplify-config.ts`:

```typescript
import { isCustomer, isOperator, isAdmin, getUserGroups } from '@/lib/amplify-config';
```

Use the `useUserGroups()` hook (`lib/use-user-groups.ts`) to fetch and cache groups from the ID token in components.

`ProtectedRoute` and `OperatorRoute` components in `app/components/` wrap pages to enforce role gating.

### Key Source Locations

- `amplify/backend.ts` — root backend: SES invoice template, inbound email forwarder Lambda
- `amplify/data/resource.ts` — all 9 DynamoDB models and their AppSync authorization rules
- `lib/queries.ts` + `lib/queries/` — AppSync GraphQL queries (modular)
- `lib/amplify-config.ts` — Amplify initialization, auth helpers
- `app/auth/session.ts` + `sessionManager.ts` — session management
- `app/components/PortalLayout.*` — shared sidebar + navigation layout used by all portals
- `app/api/` — Next.js API routes: `send-invoice-email/`, `static-route-map/`, `users/`

### Testing

Coverage thresholds: 60% branches/functions, 65% lines/statements. Test files live co-located with source or in `__tests__/` directories. Pages, layouts, and heavy UI components are excluded from coverage.

Amplify hooks are mocked in tests:
```typescript
jest.mock('@aws-amplify/ui-react');
```

### Troubleshooting

**"Auth UserPool not configured"** — `amplify_outputs.json` has placeholder values. Add Cognito IDs as environment variables in Amplify Console and trigger a new build.

**`validate:amplify-outputs` fails in CI** — Cognito environment variables (`AMPLIFY_COGNITO_USER_POOL_ID`, `AMPLIFY_COGNITO_CLIENT_ID`, `AMPLIFY_IDENTITY_POOL_ID`, `AWS_REGION`) are not set in Amplify Console.

**"Cannot find module amplify_outputs.json"** — Run `npm run generate:config`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
