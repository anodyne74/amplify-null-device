# Setting Up Amplify Compute Role for Backend Deployment

Your Amplify app is missing the **Compute role**, which is required to deploy the backend. Here's how to set it up:

## Quick Summary

The **Service role** is already configured ✅
The **Compute role** needs to be created/assigned ⏳

The compute role allows Amplify to create AWS resources (DynamoDB tables, Cognito, AppSync, etc.) on your behalf.

## Steps to Create and Assign Compute Role

### Step 1: Go to AWS IAM Console

1. Open **AWS Console** → Search for **IAM**
2. Go to **Roles** (left menu)

### Step 2: Create New Role for Amplify Backend

1. Click **Create role**
2. **Trusted entity type**: Select **AWS service**
3. **Use case**: 
   - Search for and select **Amplify**
   - Or select **CloudFormation** (Amplify uses CloudFormation under the hood)
4. Click **Next**

### Step 3: Add Permissions

1. Search for and select these policies:
   ```
   AdministratorAccess
   ```
   
   Or more restrictive (recommended for production):
   ```
   AmazonDynamoDBFullAccess
   AppSyncFullAccess
   AmazonCognitoPowerUser
   AWSCloudFormationFullAccess
   IAMFullAccess
   ```

2. Click **Next**

### Step 4: Name the Role

1. **Role name**: `AmplifyBackendDeployRole` (or any name you prefer)
2. **Description**: "Role for Amplify backend deployment"
3. Click **Create role**

### Step 5: Assign Role to Your Amplify App

1. Go back to **AWS Amplify Console**
2. Select your app: `amplify-null-device`
3. Go to **Build settings** (left menu)
4. Scroll down to **IAM roles** section
5. Under **Compute role**, click **Edit** or **Add role**
6. Select the role you just created: `AmplifyBackendDeployRole`
7. Click **Save**

### Step 6: Trigger Backend Deployment

Once the compute role is assigned:

1. Go to **Deployments** section
2. Look for **Backend deployments** or similar
3. You should now see an option to deploy the backend
4. Click **Deploy backend** (or equivalent)
5. Select **Branch**: `1-delivery-management`
6. Click **Deploy**

The deployment will take 5-15 minutes. You'll see:
- CloudFormation stack creation in progress
- Resources being created (Cognito, AppSync, DynamoDB tables, etc.)
- Completion status when done

### Step 7: Download Resource Configuration

Once deployment completes:

1. Look for **Download amplify_outputs.json** button
2. This file will contain:
   - User Pool ID
   - Client ID
   - GraphQL Endpoint
   - Identity Pool ID

### Step 8: Add to Frontend Build Environment Variables

1. Go to **Build settings**
2. Add **Environment variables**:
   ```
   AMPLIFY_COGNITO_USER_POOL_ID = ap-southeast-2_xxxxx
   AMPLIFY_COGNITO_CLIENT_ID = xxxxxxxxxxxxx
   AMPLIFY_IDENTITY_POOL_ID = ap-southeast-2:xxxxx
   AWS_REGION = ap-southeast-2
   ```
3. Click **Save** (triggers new frontend build)

## Permissions Breakdown

| Permission | Purpose |
|---|---|
| **DynamoDBFullAccess** | Create and manage DynamoDB tables for data |
| **AppSyncFullAccess** | Create and configure GraphQL API |
| **CognitoPowerUser** | Create and manage User Pools for authentication |
| **CloudFormationFullAccess** | Deploy infrastructure as code templates |
| **IAMFullAccess** | Create IAM roles for resources |

## Troubleshooting

**"Access Denied" during backend deployment?**
- The compute role doesn't have enough permissions
- Add more policies from the list above
- Or use `AdministratorAccess` for testing

**Backend deployment still not visible?**
- Refresh the Amplify Console page
- Check that compute role was properly saved
- Try clearing browser cache

**CloudFormation stack creation fails?**
- Check CloudFormation console for error messages
- Common issues:
  - DynamoDB table quotas exceeded
  - Insufficient AppSync quotas
  - Region doesn't support all services

## What Gets Deployed

When you click "Deploy backend", Amplify will create:

```
✅ Cognito User Pool (authentication)
  - User sign-up/sign-in
  - Password policies
  - User groups (customer/operator)

✅ AppSync GraphQL API
  - Schema from your amplify/data/resource.ts
  - Authorization rules
  - API key or IAM auth

✅ DynamoDB Tables
  - Customer
  - Route
  - Stop
  - Invoice
  - LineItem
  - PaymentRecord
  - Operator
  - AuditLog

✅ IAM Roles & Policies
  - For accessing DynamoDB
  - For accessing AppSync
  - For Cognito integration

✅ CloudWatch Logs
  - For debugging and monitoring
```

## Next: Configure Frontend

After backend is deployed and you have the resource IDs:

1. Add environment variables to frontend build (Step 8 above)
2. Trigger a new frontend build
3. Frontend will pick up real Cognito credentials
4. Authentication should work!

## Questions?

Refer back to these docs:
- `BACKEND_DEPLOYMENT.md` - Backend deployment overview
- `AUTH_USERPOOL_NOT_CONFIGURED_FIX.md` - Authentication setup
- `GET_COGNITO_IDS.md` - Finding your resource IDs
