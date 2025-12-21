# Getting Your Cognito IDs from AWS Console

This guide shows exactly where to find your AWS Cognito configuration to fix the "Auth UserPool not configured" error.

## Find Your Cognito Resources

### Method 1: Via AWS Amplify (Recommended)

1. Open **AWS Amplify Console**
2. Select your app: `amplify-null-device`
3. Go to **Deployments** (backend section)
4. Find the latest successful backend deployment (should show status: **Deployed**)
5. Click on it to expand deployment details
6. Look for **Stack outputs** or a similar section showing resource IDs

You should see outputs like:
```
CognitoUserPoolId: ap-southeast-2_abc123xyz
CognitoClientId: 1a2b3c4d5e6f7g8h9i0j
CognitoIdentityPoolId: ap-southeast-2:12345678-1234-1234-1234-123456789012
```

### Method 2: Via AWS Cognito Console

1. Open **AWS Cognito** console
2. Click **User pools** (on the left sidebar)
3. You should see a pool for your Amplify app (likely named something like `amplify-...`)
4. Click the pool name to open it

#### Get User Pool ID
- You'll see **User pool ID** displayed prominently at the top or in a panel
- Format: `ap-southeast-2_xxxxx` (10-13 characters after underscore)

#### Get Client ID
- In the same pool, go to **App integration** → **App clients**
- Click your app client (should be something like `amplify-...`)
- Copy the **Client ID** (32-128 character alphanumeric string)

#### Get Identity Pool ID
- Go to **Amazon Cognito** → **Identity pools** (in left menu, may say "Federated Identities")
- Find the identity pool associated with your app
- Click it to open
- Copy the **Identity pool ID** (format: `ap-southeast-2:12345678-1234-1234-1234-123456789012`)

### Method 3: Via CloudFormation Stacks

1. Open **AWS CloudFormation** console
2. Look for stacks related to your Amplify app (likely containing `amplify` in the name)
3. Click the stack
4. Go to **Outputs** tab
5. Find keys containing:
   - `UserPoolId`
   - `ClientId`  
   - `IdentityPoolId`

## Add to Amplify Console

Once you have your three IDs:

1. Go to **AWS Amplify Console** → Your app → **Build settings**
2. Scroll down to **Environment variables**
3. Click **Add environment variable** and add these three:

| Variable Name | Value |
|---|---|
| `AMPLIFY_COGNITO_USER_POOL_ID` | `ap-southeast-2_abc123xyz` |
| `AMPLIFY_COGNITO_CLIENT_ID` | `1a2b3c4d5e6f7g8h9i0j` |
| `AMPLIFY_IDENTITY_POOL_ID` | `ap-southeast-2:12345678-1234-1234-1234-123456789012` |
| `AWS_REGION` | `ap-southeast-2` |

4. Click **Save**

This will automatically trigger a new frontend build with your real Cognito configuration.

## Verify It Worked

After the build completes:

1. Open your Amplify app URL
2. Try to sign up with an email address
3. You should no longer see the "Auth UserPool not configured" error
4. You may see a "User is not confirmed" message, which is normal - check the email for a confirmation code

## Common Issues

**Can't find the resources?**
- Verify you have a deployed backend environment in Amplify (not just code)
- Check that you're in the correct AWS region (`ap-southeast-2`)
- Look for stacks prefixed with your app name in CloudFormation

**Getting wrong IDs?**
- User Pool ID format: Always starts with region code like `ap-southeast-2_`
- Client ID: Alphanumeric, usually 24-32 characters
- Identity Pool ID: Contains `ap-southeast-2:` followed by UUID format

**Still not working?**
- Clear browser cache and try again
- Check browser console (F12) for error messages
- Verify the environment variables are actually saved in Amplify Console
- Wait a few minutes for CDN to update after build completes
