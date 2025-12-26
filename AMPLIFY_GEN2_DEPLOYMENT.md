# Amplify Gen 2 Deployment Guide

This project uses **AWS Amplify Gen 2** (CDK-based infrastructure) instead of the older Amplify Gen 1 (CloudFormation-based) approach.

## Important: Don't Use `amplify pull`

⚠️ **Do NOT run `amplify pull`** - this command is for Amplify Gen 1 projects only.

If you run `amplify pull`, you'll get an error because:
- Amplify Gen 2 uses TypeScript CDK instead of CloudFormation
- Backend definitions are in `amplify/backend.ts`, not CloudFormation templates
- The project is managed via code, not CLI pull/push

## Project Structure

```
.
├── amplify/                          # Backend infrastructure (Gen 2)
│   ├── backend.ts                   # Root backend definition
│   ├── auth/
│   │   └── resource.ts              # Cognito User Pool setup
│   ├── data/
│   │   └── resource.ts              # AppSync GraphQL API + DynamoDB
│   ├── types/
│   │   └── index.ts                 # TypeScript type definitions
│   ├── package.json
│   └── tsconfig.json
├── amplify_outputs.json             # Frontend config (generated)
├── amplify.yml                      # Amplify build spec
└── .amplify/                        # Local CLI state (don't commit)
```

## Backend Definition Files

### amplify/backend.ts
Imports and combines all backend resources:
```typescript
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';

export const backend = defineBackend({
  auth,
  data,
});
```

### amplify/auth/resource.ts
Defines Cognito User Pool with:
- Email authentication
- User sign-up and sign-in
- Password policies
- Email verification

### amplify/data/resource.ts
Defines AppSync GraphQL API with:
- 8 DynamoDB models (Customer, Route, Invoice, etc.)
- GraphQL schema with queries, mutations
- Authorization rules (customer-scoped access, operator full access)

## Deployment Process

### 1. Local Development

```bash
# Install dependencies
npm install

# Build frontend
npm run build

# Type checking
npm run typecheck

# Run tests
npm run test:ci

# Run linting
npm run lint
```

### 2. Push to GitHub

```bash
git add .
git commit -m "Your commit message"
git push origin 1-delivery-management
```

### 3. GitHub Actions Workflow

The `.github/workflows/ci.yml` workflow automatically:

1. **Quality Gates** (runs on all branches):
   - TypeScript type checking
   - ESLint linting
   - Jest tests
   - Security audit

2. **Build and Deploy** (runs on push to main/1-delivery-management):
   - Builds Next.js project
   - Syncs to S3 bucket
   - Invalidates CloudFront cache
   - **Triggers Amplify backend deployment** (via buildspec in amplify.yml)

### 4. Amplify Backend Deployment

When you push to GitHub, Amplify automatically:
1. Pulls your code (including `amplify/` directory)
2. Runs build commands in `amplify.yml`
3. Generates CloudFormation templates from `amplify/backend.ts`
4. Deploys to AWS:
   - Creates Cognito User Pool
   - Creates AppSync GraphQL API
   - Creates DynamoDB tables
   - Sets up authorization rules

**Note**: Backend deploys are **per-branch**. The `main` branch has its own resources, and `1-delivery-management` has separate resources.

## Understanding amplify_outputs.json

This file contains generated configuration for the frontend:

```json
{
  "auth": {
    "user_pool_id": "ap-southeast-2_xxxxx",
    "aws_region": "ap-southeast-2",
    "user_pool_client_id": "xxxxx",
    "identity_pool_id": "ap-southeast-2:xxxxx"
  },
  "data": {
    "url": "https://xxxxx.appsync-api.ap-southeast-2.amazonaws.com/graphql",
    "api_key": "xxxxx"
  }
}
```

### Generation Process

1. **Placeholder** (local development):
   - `generate-amplify-outputs.sh` creates placeholder values
   - Prevents "Cannot find module" TypeScript errors
   - Used during local `npm run build`

2. **Real Values** (GitHub Actions):
   - Amplify backend generates real values after deployment
   - `scripts/generate-amplify-outputs-from-backend.js` injects real IDs
   - Environment variables injected: `AMPLIFY_COGNITO_USER_POOL_ID`, `AMPLIFY_COGNITO_CLIENT_ID`, etc.
   - File is committed to GitHub for build reproducibility

3. **Runtime** (browser):
   - `Amplify.configure(outputs)` uses these values
   - Frontend connects to real Cognito and AppSync

## Monitoring Deployment

### Check Amplify Console

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Select app: `amplify-null-device`
3. Select branch: `1-delivery-management`
4. View:
   - Frontend build status
   - Backend deployment logs
   - CloudFormation stack creation progress

### Check CloudFormation Stacks

1. Go to [AWS CloudFormation Console](https://console.aws.amazon.com/cloudformation/)
2. Look for stacks starting with: `amplify-d2qllmg205y34i-1-delivery-management-`
3. View stacks:
   - Root stack (parent)
   - `auth` stack (Cognito User Pool)
   - `data` stack (AppSync + DynamoDB)
   - Nested stacks (table management)

### Expected Resources

When deployment succeeds, you should see:
- ✅ Cognito User Pool (authentication)
- ✅ AppSync GraphQL API (data access)
- ✅ DynamoDB tables (8 tables for data storage)
- ✅ IAM roles and policies (access control)

## Troubleshooting

### Backend not deploying

**Symptoms**: CloudFormation stacks not appearing, backend resources missing

**Solutions**:
1. Check GitHub Actions workflow ran successfully
2. Verify `amplify.yml` buildspec is correct
3. Check Amplify Console for backend deployment logs
4. Ensure compute role is assigned in Amplify Console settings
5. Check CloudFormation logs for stack creation failures

### "Cannot find module amplify_outputs.json"

**Cause**: File missing during TypeScript compilation

**Solution**: Run `bash generate-amplify-outputs.sh` to create placeholder

### Cognito credentials in frontend

**Cause**: `amplify_outputs.json` has wrong Cognito IDs

**Solutions**:
1. Verify backend deployed successfully
2. Check CloudFormation stack outputs for real values
3. Add environment variables to GitHub secrets
4. Let GitHub Actions regenerate `amplify_outputs.json` on next push

## Key Differences: Gen 1 vs Gen 2

| Feature | Gen 1 | Gen 2 |
|---------|-------|-------|
| Definition | CloudFormation YAML | TypeScript CDK |
| Location | AWS Console pull/push | Code repository |
| CLI Commands | `amplify push/pull` | Not used |
| Configuration | CLI-driven | Code-driven |
| Infrastructure | Managed by CLI | Deployed via GitHub Actions |
| Version Control | Generated files | Source code |

## Next Steps

1. ✅ Verify GitHub Actions secrets are configured
2. ✅ Push code to trigger workflow
3. ⏳ Wait for Amplify backend deployment (5-15 minutes)
4. ⏳ Verify CloudFormation stacks created
5. ⏳ Test authentication with real Cognito
6. ⏳ Create Cognito user groups (customer, operator)

## Resources

- [Amplify Gen 2 Documentation](https://docs.amplify.aws/gen2/)
- [Amplify Backend Definition](https://docs.amplify.aws/gen2/build-a-backend/)
- [AppSync with Amplify](https://docs.amplify.aws/gen2/build-a-backend/data/)
- [CloudFormation Console](https://console.aws.amazon.com/cloudformation/)
