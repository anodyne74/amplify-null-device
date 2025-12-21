# AWS Deployment Credentials Setup

## Prerequisites Checklist

Before deploying to AWS UAT, you need:

- [ ] AWS Account (with appropriate permissions)
- [ ] AWS Access Key ID
- [ ] AWS Secret Access Key
- [ ] GitHub account with push access to repo

---

## Step 1: Get AWS Credentials

### If you have an existing AWS Account:

1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Go to IAM → Users → Your User
3. Click "Create access key"
4. Download the CSV file (contains Access Key ID and Secret Access Key)
5. Save securely - you'll need these next

### If you need a new AWS Account:

1. Go to [AWS Signup](https://aws.amazon.com/)
2. Create account with email and payment method
3. Follow steps above to create access keys

---

## Step 2: Configure AWS CLI

### On your machine:

```bash
# Install AWS CLI (if not already installed)
# macOS:
brew install awscli

# Linux:
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Windows:
# Download from https://aws.amazon.com/cli/

# Verify installation
aws --version
```

### Configure credentials:

```bash
aws configure
```

You'll be prompted to enter:
- **AWS Access Key ID**: [Your Access Key ID from step 1]
- **AWS Secret Access Key**: [Your Secret Access Key from step 1]
- **Default region name**: ap-southeast-2
- **Default output format**: json

This creates `~/.aws/credentials` and `~/.aws/config` files.

### Verify it worked:

```bash
aws sts get-caller-identity
```

Should output something like:
```json
{
    "UserId": "AIDAI...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

---

## Step 3: Set Up GitHub Access (if using script)

### Option A: GitHub Token (Recommended)

```bash
# GitHub settings → Developer settings → Personal access tokens → Tokens (classic)
# Create token with 'repo' scope
# Copy token

# Configure git
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

### Option B: SSH Key

```bash
# Generate SSH key (if not already done)
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add to GitHub: Settings → SSH and GPG keys → New SSH key
cat ~/.ssh/id_ed25519.pub

# Configure git to use SSH
git remote set-url origin git@github.com:anodyne74/amplify-null-device.git
```

### Verify it worked:

```bash
git remote -v
# Should show your repo URL
```

---

## Step 4: Deploy!

### Quick start:

```bash
cd /home/dave/Code/amplify-null-device
./deploy-to-uat.sh
```

### With Amplify App ID (if you have one):

```bash
./deploy-to-uat.sh --app-id <YOUR_AMPLIFY_APP_ID>
```

### Manual deployment:

```bash
git push origin 1-delivery-management
# Then use AWS Amplify Console to connect the repo and deploy
```

---

## Step 5: Access Your Deployment

Once deployment completes:

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Find your app in the list
3. Click on it
4. Find the "Domain" URL
5. Click it to access your UAT app

---

## Useful AWS CLI Commands

```bash
# Check AWS account
aws sts get-caller-identity

# List Amplify apps
aws amplify list-apps --region ap-southeast-2

# List S3 buckets
aws s3 ls

# Check CloudWatch logs
aws logs describe-log-groups --region ap-southeast-2

# View deployed Lambda functions
aws lambda list-functions --region ap-southeast-2
```

---

## Security Best Practices

⚠️ **IMPORTANT**:

1. **Never commit credentials** to git
   - AWS keys should only be in `~/.aws/credentials`
   - GitHub tokens should only be used via git, not committed

2. **Rotate credentials regularly**
   - AWS Access Keys every 90 days
   - GitHub tokens every 6 months

3. **Use IAM roles** in production
   - Give minimal required permissions
   - Don't use root account

4. **Enable MFA**
   - AWS Console → My Security Credentials → MFA
   - GitHub → Settings → Security → Two-factor authentication

---

## Troubleshooting

### "aws: command not found"
- AWS CLI not installed
- Solution: Follow install instructions above for your OS

### "Unable to locate credentials"
- AWS credentials not configured
- Solution: Run `aws configure`

### "An error occurred when calling the GetUser operation: User is not authorized"
- AWS access key is invalid or permissions insufficient
- Solution: Check Access Key ID and Secret in AWS console

### "Permission denied (publickey)"
- GitHub SSH key not set up
- Solution: Add SSH key to GitHub or use token-based auth

### Build fails in Amplify Console
- Check `amplify.yml` configuration
- Review build logs in console
- Verify `package.json` scripts exist

---

## Next Steps After Deployment

1. **Test the application**:
   - Login with customer account
   - Test invoice generation
   - Verify PDF downloads

2. **Set up monitoring**:
   - AWS CloudWatch for logs
   - AWS X-Ray for API tracing
   - CloudFront cache statistics

3. **Configure custom domain**:
   - Amplify Console → Domain management
   - Point your domain to Amplify

4. **Set up CI/CD pipeline**:
   - GitHub Actions for automated tests
   - Branch protection rules
   - Required status checks before merge

---

## Support Resources

- AWS Amplify Docs: https://docs.amplify.aws/
- AWS CLI Reference: https://docs.aws.amazon.com/cli/latest/reference/
- GitHub SSH Keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh
- Cognito Documentation: https://docs.aws.amazon.com/cognito/

