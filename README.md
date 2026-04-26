# nd-assets — Delivery Management System

A serverless delivery management web application built with **Next.js**, **AWS Amplify Gen 2**, and **AWS Cognito**. It provides separate portals for customers and operators, with full role-based access control and a GraphQL data API backed by DynamoDB.

## Overview

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (React 18, TypeScript) |
| Hosting | AWS Amplify Hosting + CloudFront |
| Authentication | AWS Cognito User Pools |
| API | AWS AppSync (GraphQL) |
| Database | Amazon DynamoDB (8 tables) |
| CI/CD | GitHub Actions (quality gates) + Amplify Console (deployment) |

### User Roles

- **customer** — Can read their own routes, invoices, and related records.
- **operator** — Full create/read/update/delete access to all operational data, plus audit log access.

### Data Models

Customer · Operator · Route · Stop · Invoice · LineItem · PaymentRecord · AuditLog

## Installation

### Prerequisites

- Node.js 20+
- AWS CLI v2 (`aws --version`)
- AWS account (region `ap-southeast-2`)

### Local Setup

```bash
# Clone the repository
git clone https://github.com/anodyne74/amplify-null-device.git
cd amplify-null-device

# Install dependencies
npm ci

# Generate a local amplify_outputs.json (placeholder values for dev)
npm run generate:config

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Usage

After logging in, users are routed based on their Cognito group:

- **Customers** land on the customer portal — view routes and invoices.
- **Operators** land on the operator portal — manage customers, routes, stops, invoices, and payments.

Authentication is handled by the `@aws-amplify/ui-react` `Authenticator` component. Group membership is read from the `cognito:groups` claim in the ID token.

## Configuration

### amplify_outputs.json

This file is **auto-generated** (not committed to git). It maps the frontend to the deployed AWS resources. During local development a placeholder copy is created by:

```bash
npm run generate:config
```

In Amplify Console builds, the script reads real values from environment variables or backend outputs.

### Amplify Console Environment Variables

Set these in **Amplify Console → App → Environment variables** so the build injects real Cognito credentials:

| Variable | Description |
|---|---|
| `AMPLIFY_COGNITO_USER_POOL_ID` | Cognito User Pool ID (e.g. `ap-southeast-2_xxxxx`) |
| `AMPLIFY_COGNITO_CLIENT_ID` | App client ID |
| `AMPLIFY_IDENTITY_POOL_ID` | Identity Pool ID (e.g. `ap-southeast-2:xxxx-...`) |
| `AWS_REGION` | `ap-southeast-2` |

### Cognito User Groups

Create two groups in the deployed Cognito User Pool:

| Group | Description | Precedence |
|---|---|---|
| `customer` | Regular customers — read own data | 1 |
| `operator` | Staff with elevated permissions | 2 |

New users are not automatically assigned to a group. Operators must be manually added via the Cognito Console, or you can configure a **Post Confirmation** Lambda trigger to auto-assign new sign-ups to the `customer` group. See [`COGNITO_SETUP.md`](COGNITO_SETUP.md) for a ready-to-use Lambda example.

## Deployment

### Quick Start (Recommended)

```bash
# 1. Configure AWS credentials (one-time)
aws configure   # region: ap-southeast-2

# 2. Run the deploy script
./deploy-to-uat.sh
```

### AWS Amplify Console

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. **New app → Host web app → GitHub**
3. Select `anodyne74/amplify-null-device` and branch `1-delivery-management`
4. Click **Save and deploy**

Every push to the connected branch triggers a full build and deployment automatically.

### CI/CD Pipeline

GitHub Actions runs quality gates on every push and pull request:

1. TypeScript type checking (`npm run typecheck`)
2. ESLint linting (`npm run lint`)
3. Jest tests (`npm run test:ci`)
4. Security audit (`npm audit --production`)

AWS Amplify Console then handles the actual build and deployment.

### Manual Steps

```bash
# Build locally
npm run typecheck && npm run lint && npm run build

# Push to trigger Amplify deployment
git push origin 1-delivery-management
```

For full deployment options including IAM role setup and backend-only deploys, see:

- [`DEPLOY_QUICK_START.md`](DEPLOY_QUICK_START.md) — fastest path
- [`DEPLOY_TO_AWS_UAT.md`](DEPLOY_TO_AWS_UAT.md) — comprehensive guide
- [`AMPLIFY_GEN2_DEPLOYMENT.md`](AMPLIFY_GEN2_DEPLOYMENT.md) — Gen 2 architecture details
- [`AMPLIFY_IAM_SETUP.md`](AMPLIFY_IAM_SETUP.md) — compute role setup
- [`GITHUB_SECRETS_SETUP.md`](GITHUB_SECRETS_SETUP.md) — CI/CD secrets

## Project Structure

```
amplify/                  # Backend (Amplify Gen 2 / CDK)
├── auth/resource.ts      # Cognito User Pool definition
├── data/resource.ts      # AppSync schema + DynamoDB tables
└── backend.ts            # Root backend entry point

app/                      # Next.js app router
├── customer/             # Customer portal pages
└── operator/             # Operator portal pages

src/                      # Shared React components and utilities
lib/                      # Amplify config helpers and auth utilities

amplify.yml               # Amplify build spec
amplify_outputs.json      # Generated AWS resource config (not committed)
scripts/
├── generate-amplify-outputs-from-backend.js
└── validate-amplify-outputs.js
```

## Known Issues & Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Auth UserPool not configured" | `amplify_outputs.json` has placeholder values | Set Cognito env vars in Amplify Console — see [`AUTH_USERPOOL_NOT_CONFIGURED_FIX.md`](AUTH_USERPOOL_NOT_CONFIGURED_FIX.md) |
| "Cannot find module amplify_outputs.json" | File not generated | Run `npm run generate:config` |
| Build fails: TypeScript errors | Type errors in source | Run `npm run typecheck` locally and fix errors |
| Build fails: ESLint | Lint violations | Run `npm run lint` locally |
| 404 after deploy | Wrong artifact directory | Verify Amplify artifact base directory is `out` |
| Backend not deployed | Missing compute role | Follow [`AMPLIFY_IAM_SETUP.md`](AMPLIFY_IAM_SETUP.md) |

For Cognito ID lookups, see [`GET_COGNITO_IDS.md`](GET_COGNITO_IDS.md).  
For AWS credential and CLI setup, see [`AWS_SETUP.md`](AWS_SETUP.md).

## Contribution

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution guidelines, pull request process, and code of conduct.
