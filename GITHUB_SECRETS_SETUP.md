# GitHub Secrets Setup Guide

This guide explains how to configure the required secrets for the CI/CD pipeline to work with AWS.

## Required GitHub Secrets

The CI/CD workflow (`.github/workflows/ci.yml`) requires the following secrets to be configured in your GitHub repository:

### 1. **AWS_ACCESS_KEY_ID**
- **Type**: AWS IAM Access Key ID
- **Purpose**: Authenticate with AWS services
- **How to get it**:
  1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
  2. Click "Users" in the left sidebar
  3. Select your IAM user
  4. Go to "Security credentials" tab
  5. Create an access key if you don't have one
  6. Copy the Access Key ID

### 2. **AWS_SECRET_ACCESS_KEY**
- **Type**: AWS IAM Secret Access Key
- **Purpose**: Authenticate with AWS services
- **How to get it**: Same steps as Access Key ID, but copy the Secret Access Key instead

### 3. **AWS_REGION**
- **Type**: AWS Region code
- **Example**: `ap-southeast-2`
- **Purpose**: Specifies which AWS region to deploy to
- **How to choose**: Same region where your Amplify app is deployed

### 4. **AWS_S3_BUCKET**
- **Type**: S3 bucket name
- **Example**: `my-delivery-app-bucket`
- **Purpose**: S3 bucket where the Next.js build output is deployed
- **How to get it**:
  1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
  2. Find your bucket for this application
  3. Copy the bucket name (NOT the ARN)

### 5. **AWS_CLOUDFRONT_DISTRIBUTION_ID** (Optional)
- **Type**: CloudFront Distribution ID
- **Example**: `E1234ABCD56789`
- **Purpose**: Invalidates CloudFront cache after deployment
- **When needed**: Only if you have a CloudFront distribution in front of S3
- **How to get it**:
  1. Go to [AWS CloudFront Console](https://console.aws.amazon.com/cloudfront/)
  2. Find your distribution
  3. Copy the Distribution ID from the list

## How to Add Secrets to GitHub

1. Go to your GitHub repository: `https://github.com/YOUR-USERNAME/amplify-null-device`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the secret name (e.g., `AWS_ACCESS_KEY_ID`)
5. Enter the secret value
6. Click **Add secret**
7. Repeat for each secret

## Required IAM Permissions

Your AWS IAM user needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "amplify:StartDeployment",
        "amplify:GetApp",
        "amplify:GetBranch"
      ],
      "Resource": "*"
    }
  ]
}
```

## Testing Locally

To test the deployment locally before pushing to GitHub:

```bash
# Set environment variables
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="ap-southeast-2"
export AWS_S3_BUCKET="your-bucket-name"

# Build the project
npm run build

# Test S3 sync (dry run - doesn't actually delete)
aws s3 sync ./out s3://$AWS_S3_BUCKET --delete --dryrun

# Actual sync
aws s3 sync ./out s3://$AWS_S3_BUCKET --delete
```

## Verification

After configuring secrets and pushing code:

1. Go to your GitHub repository
2. Click **Actions** tab
3. You should see the "CI/CD Pipeline" workflow running
4. Click on the workflow run to see details
5. The `build-and-deploy` job should:
   - ✅ Pass quality gates
   - ✅ Build the Next.js project
   - ✅ Configure AWS credentials
   - ✅ Sync to S3
   - ✅ Invalidate CloudFront (if configured)

## Troubleshooting

### Error: "Invalid bucket name"
- **Cause**: `AWS_S3_BUCKET` secret is not set or empty
- **Solution**: Add the `AWS_S3_BUCKET` secret to GitHub with your S3 bucket name

### Error: "Access Denied" during S3 sync
- **Cause**: IAM user lacks S3 permissions
- **Solution**: Check IAM permissions and add S3 access policy

### Error: "No distributions found" during CloudFront invalidation
- **Cause**: `AWS_CLOUDFRONT_DISTRIBUTION_ID` secret not set
- **Solution**: Either set the secret or leave it unset (invalidation is optional)

## Security Best Practices

1. **Never commit secrets**: These should only be in GitHub secrets, never in code
2. **Rotate credentials regularly**: Use AWS IAM best practices
3. **Use IAM roles**: Consider using `aws-actions/configure-aws-credentials@v4` with OIDC instead of static keys
4. **Limit permissions**: Grant only the minimum required permissions

## Next Steps

1. Configure all required GitHub secrets
2. Push a commit to trigger the workflow
3. Monitor the Actions tab to verify deployment succeeds
4. Test the deployed application
