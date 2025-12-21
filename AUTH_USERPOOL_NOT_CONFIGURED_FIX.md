# Fix "Auth UserPool not configured" Error

## The Problem
Your Amplify deployment succeeded, but authentication fails with: **"Auth UserPool not configured"**

This is because the deployed `amplify_outputs.json` has placeholder values instead of your actual AWS Cognito configuration.

## The Solution
Configure environment variables in AWS Amplify Console to inject your real Cognito credentials during the build.

### Quick Steps

**1. Get Your Cognito IDs** (from AWS Console)
   - Open **AWS Cognito** → **User pools** → Select your pool
   - Copy the **User Pool ID** (format: `ap-southeast-2_xxxxx`)
   - Go to **App integration** → **App clients** → Copy **Client ID**
   - Find **Identity Pool ID** in Cognito Identity Pools

**2. Set Environment Variables in Amplify**
   - Go to **AWS Amplify Console** → Your App → **Build settings**
   - Scroll to **Environment variables**
   - Add:
     ```
     AMPLIFY_COGNITO_USER_POOL_ID = ap-southeast-2_xxxxx
     AMPLIFY_COGNITO_CLIENT_ID = xxxxxxxxxxxxx
     AMPLIFY_IDENTITY_POOL_ID = ap-southeast-2:xxxxx
     AWS_REGION = ap-southeast-2
     ```
   - Click **Save** (triggers new build)

**3. Wait for Build to Complete**
   - Monitor **Deployments** → Watch for build success
   - You should see: `✓ Generated amplify_outputs.json with real Amplify backend values`

**4. Test It**
   - Open your Amplify app URL
   - Try signing up → Should work without errors

## Technical Details

The new build process:
- Reads environment variables you set
- Injects real Cognito IDs into `amplify_outputs.json`
- Frontend uses this config to authenticate users
- Falls back to placeholders if not configured (for local dev)

See `AMPLIFY_AUTH_SETUP.md` for detailed troubleshooting.
