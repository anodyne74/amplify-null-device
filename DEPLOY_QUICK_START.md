# Quick Start: Deploy to AWS UAT

## TL;DR - Fastest Way to Deploy

### Step 1: Set Up AWS Credentials (One-time)
```bash
aws configure
# Enter your AWS Access Key, Secret Key, region (ap-southeast-2), and output format (json)
```

### Step 2: Deploy Using the Script
```bash
cd /home/dave/Code/amplify-null-device
./deploy-to-uat.sh
```

This will:
- ✓ Run type checking, linting, and build
- ✓ Push code to GitHub branch `1-delivery-management`
- ✓ Initiate Amplify deployment

### Step 3: Monitor Deployment
Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/) and watch the deployment status.

---

## With AWS Amplify App ID (Full CI/CD)

If you've already set up an Amplify app in the AWS console:

```bash
./deploy-to-uat.sh --app-id <YOUR_APP_ID> --region ap-southeast-2
```

Replace `<YOUR_APP_ID>` with your Amplify App ID from the AWS console.

---

## Manual Steps (Without Script)

If you prefer to deploy manually:

```bash
# 1. Build locally
npm run typecheck
npm run lint
npm run build

# 2. Push to GitHub
git push -u origin 1-delivery-management

# 3. In AWS Amplify Console:
#    - The app will auto-trigger deployment when branch is connected
#    - Wait for the deployment to complete (green checkmark)
```

---

## Verify Deployment

Once deployment completes:

1. **Check Amplify Console** for the deployment URL
2. **Test Authentication**:
   - Go to the deployment URL
   - Try logging in with a test customer account
3. **Test Core Features**:
   - Create/view routes
   - Generate invoices
   - Check dashboard

---

## Troubleshooting

### Build Failed
- Check the build logs in Amplify Console
- Common issues:
  - TypeScript errors: `npm run typecheck` locally
  - Missing dependencies: `npm install`
  - ESLint errors: `npm run lint`

### Auth Not Working
- Verify Cognito user pool is set up
- Check user email is verified in Cognito
- Review IAM permissions in `amplify_outputs.json`

### Can't Push to GitHub
- Verify you have push access to `anodyne74/amplify-null-device`
- Check SSH key or GitHub token is configured: `git remote -v`

---

## For More Details

See `DEPLOY_TO_AWS_UAT.md` in the project root for:
- Full deployment options
- Architecture details
- Rollback procedures
- Cost optimization
- Troubleshooting guide

---

## Current Project Status

| Component | Status |
|-----------|--------|
| TypeScript | ✓ Pass |
| Linting | ⚠ 18 warnings (non-blocking) |
| Build | ✓ Success |
| Frontend | ✓ Next.js configured |
| Backend | ✓ Amplify + AppSync |
| Auth | ✓ Cognito configured |
| Database | ✓ DynamoDB ready |

---

## What Gets Deployed

- **Frontend**: Next.js static export to Amplify hosting
- **Backend**: AWS AppSync GraphQL API
- **Authentication**: Cognito user pools (email + password)
- **Database**: DynamoDB tables (Routes, Invoices, etc.)

All configured in `amplify/` directory and `amplify_outputs.json`.

---

## Post-Deployment Checklist

- [ ] Visit the deployment URL
- [ ] Log in with test customer account
- [ ] Verify dashboard loads
- [ ] Check API connectivity (GraphQL calls)
- [ ] Test invoice generation
- [ ] Verify PDF download works
- [ ] Check email notifications (if configured)

