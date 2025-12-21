# Deployment to AWS for UAT

This guide covers deploying the Delivery Management System to AWS Amplify for User Acceptance Testing (UAT).

## Prerequisites

### 1. AWS Account Setup
- AWS Account with appropriate permissions
- AWS Access Key ID and Secret Access Key

### 2. Required Tools
```bash
# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify installation
aws --version

# Install Amplify CLI (optional, for local testing)
npm install -g @aws-amplify/cli
```

### 3. GitHub Integration
- Repository pushed to GitHub (anodyne74/amplify-null-device)
- GitHub personal access token ready (for AWS Amplify console)

## Deployment Steps

### Option 1: AWS Amplify Console (Recommended for UAT)

The easiest way to deploy and manage environments.

#### Step 1: Create Amplify App in AWS Console
1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/home)
2. Click "New app" → "Host web app"
3. Select "GitHub" as repository service
4. Authorize and select: `anodyne74/amplify-null-device`
5. For branch, select: `1-delivery-management` (or your UAT branch)
6. Click "Save and deploy"

#### Step 2: Configure Build Settings
The `amplify.yml` file is already configured with:
- TypeScript type checking
- ESLint validation
- Jest tests (with `--passWithNoTests` flag)
- Next.js build

Your app will auto-deploy on every push to the selected branch.

#### Step 3: Environment Variables
In Amplify Console:
1. Go to App → Environment variables
2. Add any required variables (currently using amplify_outputs.json)
3. Redeploy if changes made

#### Step 4: Monitor Deployment
- View build logs in real-time
- Check deployment status in "Deployments" tab
- Access your UAT URL once green checkmark appears

---

### Option 2: Manual Deployment with S3 + CloudFront

For more control over infrastructure.

#### Step 1: Configure AWS Credentials
```bash
aws configure
# Enter:
# AWS Access Key ID: [your-key-id]
# AWS Secret Access Key: [your-secret-key]
# Default region: ap-southeast-2
# Default output format: json
```

#### Step 2: Create S3 Bucket for Frontend
```bash
# Create bucket (must be globally unique)
aws s3 mb s3://nd-assets-uat-$(date +%s) --region ap-southeast-2

# Enable static website hosting
aws s3 website s3://nd-assets-uat-$(date +%s) \
  --index-document index.html \
  --error-document 404.html
```

#### Step 3: Build the Application
```bash
cd /home/dave/Code/amplify-null-device

# Clean and rebuild
rm -rf out .next node_modules
npm install
npm run build
```

#### Step 4: Deploy Frontend to S3
```bash
# Upload static output
aws s3 sync out/ s3://nd-assets-uat-$(date +%s) \
  --delete \
  --region ap-southeast-2

# Make files publicly readable (if needed for UAT)
aws s3api put-bucket-policy \
  --bucket nd-assets-uat-$(date +%s) \
  --policy file://bucket-policy.json
```

#### Step 5: Deploy Backend with Amplify
```bash
# Initialize/configure Amplify (if not already done)
npm install -g @aws-amplify/cli
amplify configure

# Deploy backend
npx ampx pipeline-deploy --branch 1-delivery-management --app-id [your-app-id]
```

---

## Configuration Files

### amplify.yml
Defines build phases and deployment steps. Current configuration:

```yaml
frontend:
  phases:
    preBuild:
      commands:
        - npm ci --cache .npm --prefer-offline
    build:
      commands:
        - npm run typecheck
        - npm run lint
        - npm run test:ci
        - npm run build
  artifacts:
    baseDirectory: out
    files:
      - '**/*'
```

### amplify_outputs.json
Contains:
- Cognito User Pool configuration
- AppSync GraphQL endpoint
- IAM roles and permissions

**Do not commit credentials** - this file should be regenerated per environment.

---

## Post-Deployment Steps

### 1. Verify Authentication
- Test customer login flow
- Test operator login flow
- Verify session timeout after 30 minutes of inactivity

### 2. Test Core Features
- Create/view delivery routes
- Generate invoices
- Download invoice PDFs
- Verify email notifications

### 3. Monitor Logs
```bash
# View CloudWatch logs for backend
aws logs tail /aws/amplify/[app-id]/[environment] --follow

# View browser console for frontend errors
# Check AWS CloudFront access logs for HTTP errors
```

### 4. Performance Testing
- Load test with expected UAT user count
- Monitor CloudWatch metrics:
  - AppSync request latency
  - Lambda execution time
  - DynamoDB throttling

---

## Rollback Procedure

### If using Amplify Console:
1. Go to "Deployments" tab
2. Select previous successful deployment
3. Click "Redeploy"

### If using manual S3 deployment:
```bash
# Restore previous version from S3 version history
aws s3api list-object-versions --bucket nd-assets-uat-[bucket-id]
aws s3api get-object --bucket nd-assets-uat-[bucket-id] --key index.html --version-id [version-id] index.html
```

---

## Useful AWS CLI Commands

```bash
# List Amplify apps
aws amplify list-apps --region ap-southeast-2

# Get app details
aws amplify get-app --app-id [app-id] --region ap-southeast-2

# List deployments
aws amplify list-deployments --app-id [app-id] --region ap-southeast-2

# View build logs
aws amplify list-jobs --app-id [app-id] --branch-name 1-delivery-management --region ap-southeast-2

# Check Cognito user pool
aws cognito-idp describe-user-pool --user-pool-id ap-southeast-2_viHZ0B0sh --region ap-southeast-2

# View AppSync API
aws appsync get-graphql-api --api-id 23sbo4cntrgjbarzh56sx2mv2q --region ap-southeast-2
```

---

## Troubleshooting

### Build Fails
- Check `amplify.yml` for typos
- Verify `package.json` scripts exist
- Review CloudWatch build logs in Amplify console

### Authentication Fails
- Verify Cognito user pool ID matches amplify_outputs.json
- Check user group assignments (customer/operator)
- Review Cognito logs in CloudWatch

### API Calls Fail
- Verify AppSync endpoint is accessible
- Check IAM role permissions for authenticated users
- Review AppSync request/response logs

### Static Content Not Loading
- Check S3 bucket permissions (if using manual deployment)
- Verify CloudFront cache invalidation
- Check browser DevTools Network tab for 403 errors

---

## Cost Optimization for UAT

1. **Auto-scale down** after testing hours:
   - Lambda: Set reserved concurrency to 0
   - DynamoDB: Use on-demand billing during testing

2. **Cleanup**: Delete unused AppSync models and Lambda functions

3. **Set budget alerts**: AWS Billing → Budgets → Create budget ($50/month for UAT)

---

## Support

For deployment issues:
- Review AWS Amplify documentation: https://docs.amplify.aws
- Check CloudWatch logs: AWS Console → CloudWatch → Log Groups
- Enable Amplify debug logging: `DEBUG=amplify* npm run build`

