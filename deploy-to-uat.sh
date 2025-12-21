#!/bin/bash

# Deployment script for AWS Amplify UAT
# Usage: ./deploy-to-uat.sh [--branch BRANCH_NAME] [--app-id APP_ID] [--region REGION]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BRANCH="1-delivery-management"
REGION="ap-southeast-2"
APP_ID=""
DRY_RUN=false
SKIP_BUILD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --app-id)
      APP_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--branch BRANCH] [--app-id APP_ID] [--region REGION] [--dry-run] [--skip-build]"
      echo ""
      echo "Options:"
      echo "  --branch BRANCH     Git branch to deploy (default: 1-delivery-management)"
      echo "  --app-id APP_ID     AWS Amplify App ID (required for Amplify CLI deployment)"
      echo "  --region REGION     AWS region (default: ap-southeast-2)"
      echo "  --dry-run          Show what would be done without making changes"
      echo "  --skip-build       Skip local build and tests"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Print configuration
echo -e "${BLUE}=== AWS Amplify Deployment Configuration ===${NC}"
echo "Branch: $BRANCH"
echo "Region: $REGION"
if [ -n "$APP_ID" ]; then
  echo "App ID: $APP_ID"
fi
echo "Dry Run: $DRY_RUN"
echo ""

# Check prerequisites
echo -e "${BLUE}=== Checking Prerequisites ===${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
  echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
  echo "   Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  exit 1
fi
echo -e "${GREEN}✓ AWS CLI found ($(aws --version))${NC}"

# Check AWS credentials
if ! aws sts get-caller-identity --region "$REGION" &> /dev/null; then
  echo -e "${RED}❌ AWS credentials not configured. Please run 'aws configure'${NC}"
  exit 1
fi
echo -e "${GREEN}✓ AWS credentials configured${NC}"

# Check git
if ! command -v git &> /dev/null; then
  echo -e "${RED}❌ Git not found. Please install Git.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Git found${NC}"

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo -e "${YELLOW}⚠ Current branch is '$CURRENT_BRANCH', but deploying from '$BRANCH'${NC}"
  echo -e "${YELLOW}  Continuing with remote branch...${NC}"
fi

echo ""

# Step 1: Build the project
if [ "$SKIP_BUILD" = false ]; then
  echo -e "${BLUE}=== Step 1: Building Project ===${NC}"
  
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would run: npm run typecheck && npm run lint && npm run build"
  else
    echo "Running type checking..."
    npm run typecheck || {
      echo -e "${RED}❌ Type checking failed${NC}"
      exit 1
    }
    echo -e "${GREEN}✓ Type checking passed${NC}"
    
    echo "Running linting..."
    npm run lint || {
      echo -e "${RED}❌ Linting failed${NC}"
      exit 1
    }
    echo -e "${GREEN}✓ Linting passed${NC}"
    
    echo "Building application..."
    npm run build || {
      echo -e "${RED}❌ Build failed${NC}"
      exit 1
    }
    echo -e "${GREEN}✓ Build successful${NC}"
  fi
  echo ""
else
  echo -e "${YELLOW}⚠ Skipping build step${NC}"
  echo ""
fi

# Step 2: Verify Git status
echo -e "${BLUE}=== Step 2: Verifying Git Status ===${NC}"

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would check git status"
else
  UNCOMMITTED=$(git status --porcelain | wc -l)
  if [ "$UNCOMMITTED" -gt 0 ]; then
    echo -e "${YELLOW}⚠ Uncommitted changes detected:${NC}"
    git status --short
    echo ""
    read -p "Continue with deployment despite uncommitted changes? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${RED}Deployment cancelled${NC}"
      exit 1
    fi
  else
    echo -e "${GREEN}✓ Git working directory clean${NC}"
  fi
fi
echo ""

# Step 3: Push to remote (if not dry run)
echo -e "${BLUE}=== Step 3: Pushing Code to GitHub ===${NC}"

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would run: git push -u origin $BRANCH"
else
  echo "Pushing $BRANCH to GitHub..."
  git push -u origin "$BRANCH" || {
    echo -e "${RED}❌ Git push failed${NC}"
    exit 1
  }
  echo -e "${GREEN}✓ Pushed to GitHub${NC}"
fi
echo ""

# Step 4: Deploy with Amplify CLI (if app-id provided)
if [ -n "$APP_ID" ]; then
  echo -e "${BLUE}=== Step 4: Deploying with AWS Amplify ===${NC}"
  
  # Check for Amplify CLI
  if ! command -v ampx &> /dev/null; then
    echo -e "${YELLOW}⚠ @aws-amplify/cli not found, installing...${NC}"
    npm install -g @aws-amplify/cli
  fi
  
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would run: npx ampx pipeline-deploy --app-id $APP_ID --branch $BRANCH"
  else
    echo "Deploying backend with Amplify..."
    npx ampx pipeline-deploy --app-id "$APP_ID" --branch "$BRANCH" || {
      echo -e "${RED}❌ Amplify deployment failed${NC}"
      exit 1
    }
    echo -e "${GREEN}✓ Amplify deployment successful${NC}"
  fi
  echo ""
fi

# Step 5: Summary and next steps
echo -e "${BLUE}=== Deployment Summary ===${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY RUN MODE - No changes were made${NC}"
  echo ""
  echo "To perform actual deployment, run without --dry-run flag"
else
  echo -e "${GREEN}✓ Deployment initiated successfully${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Monitor deployment in AWS Amplify Console"
  echo "   https://console.aws.amazon.com/amplify/"
  echo ""
  echo "2. Wait for build to complete (usually 2-5 minutes)"
  echo ""
  if [ -n "$APP_ID" ]; then
    echo "3. Check build logs:"
    echo "   aws amplify list-jobs --app-id $APP_ID --branch-name $BRANCH --region $REGION"
  fi
  echo ""
  echo "4. Access your UAT deployment at the Amplify Console URL"
  echo ""
  echo "5. Run post-deployment tests:"
  echo "   - Test customer login"
  echo "   - Test operator login"
  echo "   - Verify database connectivity"
  echo "   - Test main features"
fi

echo ""
echo -e "${GREEN}=== Done ===${NC}"
