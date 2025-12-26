# How to Deploy Your Backend to AWS

Your backend code is ready in the `amplify/` directory, but it hasn't been deployed to AWS yet. Here's how to do it:

## Option 1: Deploy via AWS Amplify Console (Recommended for Your Setup)

### Step 1: Connect Backend to Amplify App

1. Go to **AWS Amplify Console** → Select your app: `amplify-null-device`
2. Go to **Deployments** section (at the bottom)
3. Look for **Backend environments** or **Backend deployments**
4. You should see an option like:
   - **"Deploy backend"** button, or
   - **"Connect backend environment"** option
5. If prompted, select:
   - **Branch**: `1-delivery-management`
   - **Service Role**: Create or select an IAM role that allows Amplify to manage resources
6. Click **Deploy** or **Connect**

### Step 2: Wait for Backend Deployment

The Amplify build system will:
1. Read your `amplify/backend.ts` file
2. Generate CloudFormation templates from your `amplify/auth/resource.ts` and `amplify/data/resource.ts`
3. Create AWS resources:
   - **Cognito User Pool** (for authentication)
   - **AppSync GraphQL API** (for data access)
   - **DynamoDB Tables** (Customer, Route, Invoice, etc.)
   - **IAM Roles and Policies** (for access control)

This usually takes 5-15 minutes.

### Step 3: Get Your Resource IDs

Once deployment completes, you'll see:
- **Deployed Backend Resources** table with:
  - User Pool ID (e.g., `ap-southeast-2_abc123xyz`)
  - Client ID (e.g., `1a2b3c4d5e6f7g8h9i0j`)
  - GraphQL Endpoint (e.g., `https://abc123.appsync-api.ap-southeast-2.amazonaws.com/graphql`)
  - Identity Pool ID (e.g., `ap-southeast-2:12345678-...`)

### Step 4: Click "Download amplify_outputs.json"

Once deployed, there will be a button to download the outputs file. This will contain all your resource IDs in the correct format.

### Step 5: Inject Configuration into Frontend Build

1. Go to **Build settings**
2. Add **Environment variables**:
   ```
   AMPLIFY_COGNITO_USER_POOL_ID = ap-southeast-2_abc123xyz
   AMPLIFY_COGNITO_CLIENT_ID = 1a2b3c4d5e6f7g8h9i0j
   AMPLIFY_IDENTITY_POOL_ID = ap-southeast-2:12345678-...
   ```
3. Click **Save** (this triggers a new frontend build)
4. Once frontend build completes, authentication should work!

---

## Option 2: Deploy via Local CLI (If You Have Permissions)

Currently your AWS user (`deploy-agent`) doesn't have Amplify CLI permissions, but if that changes:

```bash
cd /home/dave/Code/amplify-null-device

# Connect to existing Amplify app
amplify pull --appId d2qllmg205y34i --branch 1-delivery-management

# Deploy backend
amplify deploy
```

---

## What's Being Deployed

Your backend includes:

### Authentication (Cognito)
- User sign-up/sign-in with email
- Password policy enforcement
- User groups for role-based access (customer/operator)

### Data Model (AppSync + DynamoDB)
8 tables with relationships:
- **Customer** - Business customers
- **Operator** - Staff members  
- **Route** - Delivery routes
- **Stop** - Individual stops on routes
- **Invoice** - Billing documents
- **LineItem** - Invoice line items
- **PaymentRecord** - Payment history
- **AuditLog** - Security audit trail

### Authorization
- Customers access only their own data
- Operators have full access
- All operations logged for audit

---

## Troubleshooting

### "Stack does not exist" error
- Backend hasn't been deployed yet
- Follow Option 1 above to deploy

### "Deploy Backend" button not visible
- Check that you're in the correct Amplify app
- Check that you have the correct branch selected

### Backend deployment fails
- Check CloudFormation events in AWS Console
- Ensure your AWS account has DynamoDB table quotas available
- Ensure AppSync is available in your region (ap-southeast-2)

### Can't download amplify_outputs.json
- Wait for backend deployment to complete first
- Refresh the page after deployment finishes

---

## Next Steps After Deployment

1. **Frontend picks up real Cognito IDs** (via environment variables)
2. **Test authentication** - Try signing up with an email
3. **Create Cognito User Groups** (customer/operator) in AWS Cognito Console
4. **Test app features** - Routes, invoices, etc.

**Current Status**: ⏳ Waiting for backend deployment
