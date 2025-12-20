# Cognito Configuration Guide

This document provides step-by-step instructions for completing the Cognito user groups configuration required for the Delivery Management System.

## Overview

The system uses AWS Cognito for authentication with two user groups:
- **customer**: Regular users with read-only access to their own data
- **operator**: Staff members with elevated permissions to manage customers and routes

## Prerequisites

- AWS Account with appropriate IAM permissions
- Amplify backend deployed (via `npx ampx sandbox` or `npx ampx deploy`)
- Access to AWS Management Console

## Step 1: Deploy Amplify Backend

First, deploy the backend to create the Cognito User Pool:

```bash
# Option A: Local development with sandbox
npx ampx sandbox

# Option B: Deploy to AWS
npx ampx deploy
```

After deployment, note the User Pool ID from the output.

## Step 2: Access Cognito User Pool in AWS Console

1. Go to AWS Management Console > Cognito
2. Select "User Pools" from the left menu
3. Find your user pool (usually named after your project + "userpool" suffix)
4. Click to open the User Pool details

## Step 3: Create User Groups

### 3a. Create "customer" Group

1. In the User Pool, navigate to **User groups** (left sidebar)
2. Click **Create group**
3. Fill in:
   - **Group name**: `customer`
   - **Description**: `Regular customers using the delivery service`
   - **IAM role**: Create new or select existing role with these permissions:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": [
             "appsync:GraphQL"
           ],
           "Resource": [
             "arn:aws:appsync:*:*:apis/*/types/Query/fields/listCustomers",
             "arn:aws:appsync:*:*:apis/*/types/Query/fields/getCustomer"
           ]
         }
       ]
     }
     ```
   - **Precedence**: `1`
4. Click **Create group**

### 3b. Create "operator" Group

1. Click **Create group** again
2. Fill in:
   - **Group name**: `operator`
   - **Description**: `Staff members with elevated permissions`
   - **IAM role**: Create new or select existing role with full AppSync access:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": [
             "appsync:GraphQL"
           ],
           "Resource": "arn:aws:appsync:*:*:apis/*"
         }
       ]
     }
     ```
   - **Precedence**: `2`
3. Click **Create group**

## Step 4: Configure Token Claims

1. In the User Pool, go to **App clients and analytics**
2. Select your app client
3. Click **Edit** in the app client settings
4. Scroll to **Token customization**
5. Under **ID token customization**, ensure the following claim is included:
   - Claim name: `cognito:groups`
   - This will automatically include group membership in ID tokens

## Step 5: Test the Configuration

### 5a. Create Test Users

1. In User Pool, go to **Users**
2. Click **Create user**

**Create Test Customer:**
- Username: `testcustomer@example.com`
- Email: `testcustomer@example.com`
- Temporary password: Generate and note it
- Do NOT add to any groups yet (will test auto-assignment)

**Create Test Operator:**
- Username: `testoperator@example.com`
- Email: `testoperator@example.com`
- Temporary password: Generate and note it

### 5b. Add Test Operator to Group

1. Click on the "testoperator@example.com" user
2. Go to **Group memberships** tab
3. Click **Add user to groups**
4. Select **operator** group
5. Click **Add to groups**

### 5c. Test Authentication Flow

```bash
# Start local development server
npm run dev

# In browser:
# 1. Go to http://localhost:3000
# 2. Sign up with testcustomer@example.com
# 3. Verify email (check terminal or AWS Cognito console)
# 4. Login with test operator credentials
# 5. Open browser DevTools > Application > Local Storage > Cognito tokens
# 6. Decode the ID token (jwt.io) and verify "cognito:groups" claim
```

## Step 6: Set Up Auto-Assignment to Customer Group (Optional)

To automatically add new users to the "customer" group:

1. Create a Lambda function in AWS:

```python
# Lambda function for post-signup trigger
import boto3
import json

cognito = boto3.client('cognito-idp')

def lambda_handler(event, context):
    user_pool_id = event['userPoolId']
    username = event['userName']
    
    # Add user to customer group
    try:
        cognito.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=username,
            GroupName='customer'
        )
        print(f'Added {username} to customer group')
    except Exception as e:
        print(f'Error adding user to group: {str(e)}')
    
    return event
```

2. In Cognito User Pool:
   - Go to **User pool properties** > **Lambda triggers**
   - Under **Post confirmation**, select your Lambda function
   - Save changes

## Step 7: Verify Integration

In your app, the auth utilities will now work correctly:

```typescript
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isCustomer, isOperator } from '@/lib/amplify-config';

export function MyComponent() {
  const { user } = useAuthenticator();
  
  // Check user role
  if (isOperator(user)) {
    // Show operator dashboard
  } else if (isCustomer(user)) {
    // Show customer dashboard
  }
}
```

## Troubleshooting

### Groups not appearing in token
- Check that the app client has "cognito:groups" claim enabled
- Verify user is added to the group (not just group exists)
- Logout and login again to refresh token

### Authorization errors
- Verify IAM roles are correctly attached to groups
- Check AppSync authorization rules match group names
- Review CloudWatch logs for detailed error messages

### Users can't sign up
- Verify email configuration in User Pool settings
- Check SES (Simple Email Service) if using custom email domain
- Review password policy requirements

## Related Files

- **Auth Config**: `amplify/auth/resource.ts`
- **Auth Utilities**: `lib/amplify-config.ts`
- **Data Schema**: `amplify/data/resource.ts`
- **Task Tracking**: `.specify/specs/1-delivery-management/tasks.md`

## Next Steps

After completing Cognito configuration:
1. Phase 1 is complete ✓
2. Proceed to Phase 2: Frontend Foundation
3. Implement authentication guards in React components
4. Create customer and operator portals
