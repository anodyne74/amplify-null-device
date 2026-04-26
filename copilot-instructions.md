# Copilot Instructions for nd-assets (Delivery Management System)

## Project Overview

This is a **Next.js + AWS Amplify Gen 2** delivery management system. It uses:

- **AWS Cognito** for authentication with two user groups: `customer` and `operator`
- **AWS AppSync** (GraphQL) for the data API
- **DynamoDB** for persistent storage (8 tables)
- **AWS Amplify Hosting** + CloudFront for the frontend
- **GitHub Actions** for quality gates; **Amplify Console** for deployment

All backend infrastructure is defined as TypeScript code in the `amplify/` directory (Amplify Gen 2 / CDK approach — do **not** use `amplify pull`, which is a Gen 1 command).

## How to Use GitHub Copilot

Use Copilot to:
- Generate React components, hooks, and TypeScript types
- Write AppSync GraphQL queries and mutations
- Scaffold Amplify backend resource definitions in `amplify/`
- Help with Cognito integration (`isCustomer`, `isOperator` helpers in `lib/amplify-config.ts`)
- Troubleshoot authentication, authorization, or build failures
- Write and update Jest tests for components

## Repository Structure

```
amplify/                  # Backend (Amplify Gen 2 CDK)
├── auth/resource.ts      # Cognito User Pool (email auth, password policy)
├── data/resource.ts      # AppSync schema + DynamoDB authorization rules
└── backend.ts            # Root backend entry point

app/                      # Next.js app router pages
├── customer/             # Customer portal
└── operator/             # Operator portal

src/                      # Shared React source
lib/                      # Auth utilities and Amplify config helpers
scripts/
├── generate-amplify-outputs-from-backend.js   # Generates amplify_outputs.json
└── validate-amplify-outputs.js                # Blocks deployed builds with placeholders

amplify.yml               # Amplify build spec (committed)
amplify_outputs.json      # Generated AWS config (not committed)
```

## User Groups and Authorization

Two Cognito groups control access throughout the app:

| Group | Access |
|---|---|
| `customer` | Read own routes, invoices, stops, line items, payment records (scoped by `customerId == user.sub`) |
| `operator` | Full CRUD on all models; read/create AuditLog |

Group membership is available in the ID token as `cognito:groups`. Use the helpers in `lib/amplify-config.ts`:

```typescript
import { isCustomer, isOperator } from '@/lib/amplify-config';
const { user } = useAuthenticator();
if (isOperator(user)) { /* operator view */ }
```

### Setting Up User Groups

After the backend is deployed, create groups in the AWS Cognito Console:

1. **AWS Console → Cognito → User pools** → select your pool
2. **User groups → Create group**
   - Name: `customer`, Description: `Regular customers`, Precedence: `1`
   - Name: `operator`, Description: `Staff with elevated permissions`, Precedence: `2`
3. Manually add operator users to the `operator` group
4. Optionally, attach a Post Confirmation Lambda trigger to auto-assign new sign-ups to `customer`

See [`COGNITO_SETUP.md`](COGNITO_SETUP.md) for IAM role JSON examples and a ready-to-use Lambda function.

## AWS Amplify Deployment

### CI/CD Flow

```
git push → GitHub Actions (quality gates) → Amplify Console (build + deploy)
```

GitHub Actions runs only quality gates — no AWS credentials are needed in GitHub Secrets for the current setup. Amplify Console handles deployment when a push lands on a connected branch.

### Amplify Build Phases (amplify.yml)

**Backend phase**: installs deps, type-checks and lints `amplify/`  
**Frontend preBuild**: installs deps, runs `npm run generate:config` and `npm run validate:amplify-outputs`  
**Frontend build**: type-checks, lints, runs tests, then `npm run build`

### Required Amplify Console Configuration

1. **Connect repository**: GitHub → `anodyne74/amplify-null-device` → branch `1-delivery-management`
2. **IAM compute role**: Create `AmplifyBackendDeployRole` with the following policies and assign it in Amplify Console → Build settings → IAM roles:
   - `AmazonDynamoDBFullAccess`
   - `AppSyncFullAccess`
   - `AmazonCognitoPowerUser`
   - `AWSCloudFormationFullAccess`
   - `IAMFullAccess`
3. **Environment variables** (Amplify Console → App → Environment variables):

   | Variable | Value |
   |---|---|
   | `AMPLIFY_COGNITO_USER_POOL_ID` | `ap-southeast-2_xxxxx` |
   | `AMPLIFY_COGNITO_CLIENT_ID` | (your client ID) |
   | `AMPLIFY_IDENTITY_POOL_ID` | `ap-southeast-2:xxxx-...` |
   | `AWS_REGION` | `ap-southeast-2` |

See [`AMPLIFY_IAM_SETUP.md`](AMPLIFY_IAM_SETUP.md) for step-by-step IAM role creation.

### Amplify Gen 2 Notes

- Backend definitions live in `amplify/` as TypeScript — never use `amplify pull`
- Backend is per-branch (each branch gets isolated AWS resources)
- Use `npx ampx pipeline-deploy --app-id <id> --branch <branch>` for manual backend deploys
- `amplify_outputs.json` is generated during build; do not commit it

## Troubleshooting

### "Auth UserPool not configured"

The deployed `amplify_outputs.json` contains placeholder values. Fix:
1. Get your Cognito IDs from Amplify Console or CloudFormation stack outputs (see [`GET_COGNITO_IDS.md`](GET_COGNITO_IDS.md))
2. Add them as environment variables in Amplify Console (see above)
3. Trigger a new build — the `generate:config` script will inject real values

### "Cannot find module amplify_outputs.json"

Run `npm run generate:config` locally to create the file with placeholder values.

### Amplify validate:amplify-outputs fails in CI

The `validate-amplify-outputs.js` script fails deployed builds when placeholder values remain. This means the Cognito environment variables are not set in Amplify Console.

### Backend not deploying / CloudFormation stacks missing

- Verify the compute role is assigned in Amplify Console → Build settings → IAM roles
- Check Amplify Console backend deployment logs
- Look for errors in AWS CloudFormation console (stacks prefixed with your app name)

### Groups not appearing in token

- Confirm the user is added to the group (not just that the group exists)
- Log out and log back in to refresh the ID token
- Verify the app client has the `cognito:groups` claim in ID token settings

## Local Development

```bash
npm ci                        # Install dependencies
npm run generate:config       # Create local amplify_outputs.json (placeholders)
npm run dev                   # Start Next.js dev server at localhost:3000
npm run typecheck             # TypeScript check
npm run lint                  # ESLint
npm run test                  # Jest (watch mode)
npm run test:ci               # Jest (CI mode, with coverage)
```

## Key References

- [`AMPLIFY_GEN2_DEPLOYMENT.md`](AMPLIFY_GEN2_DEPLOYMENT.md) — Gen 2 architecture and deployment detail
- [`AMPLIFY_BUILD_CONFIG.md`](AMPLIFY_BUILD_CONFIG.md) — build spec explanation
- [`AMPLIFY_AUTH_SETUP.md`](AMPLIFY_AUTH_SETUP.md) — Cognito configuration walkthrough
- [`AUTHORIZATION_ACCESS_MATRIX.md`](AUTHORIZATION_ACCESS_MATRIX.md) — per-model access rules
- [`GITHUB_SECRETS_SETUP.md`](GITHUB_SECRETS_SETUP.md) — CI/CD secrets guidance
- [AWS Amplify Gen 2 docs](https://docs.amplify.aws/gen2/)
- [AppSync with Amplify](https://docs.amplify.aws/gen2/build-a-backend/data/)
