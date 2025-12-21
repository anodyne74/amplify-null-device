# Amplify Auth Configuration Guide

## Problem
When attempting to sign up or log in, you receive: "Auth UserPool not configured"

This means the `amplify_outputs.json` file deployed to CloudFront contains placeholder values instead of your actual AWS Cognito configuration.

## Solution

Your Amplify application has a **backend** (AWS Cognito, AppSync, etc.) and a **frontend** (Next.js static export). The backend was built and deployed first, creating actual AWS resources. The frontend needs to know the IDs of these resources to connect to them.

### Step 1: Get Your Backend Resource IDs

1. Go to **AWS Amplify Console** → Your App → **Build settings**
2. Scroll down to see if there's a backend environment deployed
3. If you have a deployed backend, it will show something like:
   - Backend Environment: `1-delivery-management` (or similar)
   - Status: `Deployed`

### Step 2: Find Your Cognito Configuration

There are two ways to get your Cognito IDs:

#### Option A: Via AWS Cognito Console (Direct)
1. Open **AWS Cognito Console**
2. Go to **User pools**
3. Select the pool for your Amplify app (likely named `amplify-...` or similar)
4. Copy the **User pool ID** (format: `ap-southeast-2_xxxxx`)
5. Go to **App integration** → **App client settings**
6. Copy the **Client ID**
7. Back in main User pool, go to **Access** → **Identity providers**
8. Find the **Cognito** identity pool ID (format: `ap-southeast-2:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

#### Option B: Via Amplify Backend Output
1. In **AWS Amplify Console**, go to **Deployments** (Backend)
2. Find the latest successful backend deployment
3. Look for **Stack outputs** or similar section
4. Find values like:
   - `CognitoUserPoolId`: `ap-southeast-2_xxxxx`
   - `CognitoClientId`: `xxxxxxxxxxxxx`
   - `CognitoIdentityPoolId`: `ap-southeast-2:xxxxx`

### Step 3: Add Environment Variables to Amplify Build

1. In **AWS Amplify Console** → Your App → **Build settings**
2. Scroll to **Environment variables**
3. Add these three variables:
   ```
   AMPLIFY_COGNITO_USER_POOL_ID = ap-southeast-2_xxxxx
   AMPLIFY_COGNITO_CLIENT_ID = xxxxxxxxxxxxx
   AMPLIFY_IDENTITY_POOL_ID = ap-southeast-2:xxxxx
   AWS_REGION = ap-southeast-2
   ```
   (Replace with your actual values)

4. Click **Save** (this will trigger a new build)

### Step 4: Monitor the Build

1. Go to **Deployments** (Frontend)
2. Watch for the build to complete
3. Check the build logs to see:
   ```
   ✓ Generated amplify_outputs.json with real Amplify backend values
   ```

### Step 5: Test Authentication

Once the build succeeds:
1. Open your Amplify application URL
2. Try to sign up with a new email
3. You should no longer see "Auth UserPool not configured"

## Alternative: Manual amplify_outputs.json

If you prefer to manually create the file:

1. Get your Cognito IDs (see Step 2 above)
2. Edit `amplify_outputs.json` in your repository:
   ```json
   {
     "auth": {
       "user_pool_id": "ap-southeast-2_xxxxx",
       "aws_region": "ap-southeast-2",
       "user_pool_client_id": "xxxxxxxxxxxxx",
       "identity_pool_id": "ap-southeast-2:xxxxx",
       ...
     }
   }
   ```
3. Commit and push
4. Trigger a new Amplify build

## Troubleshooting

**Still getting "Auth UserPool not configured"?**

1. Check that `amplify_outputs.json` in the deployed version has real IDs (not PLACEHOLDER)
   - In your browser's Network tab, look for the `amplify_outputs.json` request
   - Or check the source at `https://your-amplify-url/amplify_outputs.json`

2. Verify the region is correct (should match where your Cognito is: `ap-southeast-2`)

3. Clear browser cache and try again

4. Check browser console for errors from `@aws-amplify/ui-react`

## Next: Configure Cognito User Groups

Once authentication is working, you need to set up user groups in Cognito:

1. Open **AWS Cognito Console** → Your User pool
2. Go to **User groups** (under Users and groups section)
3. Create two groups:
   - **Name**: `customer`, **Description**: Regular customers
   - **Name**: `operator`, **Description**: Staff with elevated permissions
4. Add IAM roles to each group (optional for basic setup)
5. Manually add your test users to appropriate groups

Users created in these groups will have `cognito:groups` claim in their ID token, allowing role-based access control in your app.
