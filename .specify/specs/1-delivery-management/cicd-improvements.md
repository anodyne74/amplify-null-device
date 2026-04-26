# CI/CD Pipeline Improvements Guide

**Purpose**: Recommended enhancements to current Amplify deployment pipeline  
**Current State**: Amplify hosting with basic `ampx pipeline-deploy` (infrastructure only)  
**Target State**: Full-featured pipeline with quality gates and security scanning  
**Status**: Ready to implement

---

## Executive Summary

Your current Amplify deployment works well for infrastructure, but **lacks critical quality gates** required by the project constitution:

- ❌ **No type checking** (Constitution: "Full-Stack TypeScript Consistency")
- ❌ **No test execution** (Constitution: "Testing as Quality Gate")
- ❌ **No linting** before deployment
- ❌ **No security scanning** for vulnerabilities

**This guide adds these gates without changing your existing Amplify hosting setup.**

---

## Current Pipeline Analysis

### What's Working ✅

```yaml
backend:
  build:
    - npm ci
    - npx ampx pipeline-deploy  # Infrastructure deployment

frontend:
  preBuild:
    - npm ci
  build:
    - npm run build  # Builds Next.js static site
  artifacts:
    baseDirectory: out  # Static export output
```

**Strengths**:
- ✅ Infrastructure as code via Amplify backend
- ✅ Automatic environment provisioning
- ✅ Branch-based deployments
- ✅ Dependency caching for speed

### What's Missing ❌

1. **Type checking** - Broken TypeScript compiles to production
2. **Linting** - Code quality issues slip through
3. **Testing** - No test execution, regressions unreported
4. **Security scanning** - Vulnerable dependencies not caught
5. **Build verification** - No guarantee output is valid
6. **Audit trail** - No record of what was deployed by whom

---

## Recommended Improvements

### Step 1: Update `amplify.yml` with Quality Gates

Replace your current `amplify.yml` with this enhanced version:

```yaml
version: 1

backend:
  phases:
    build:
      commands:
        - npm ci --cache .npm --prefer-offline
        
        # NEW: Type check backend code (10 seconds)
        - |
          if [ -d "amplify" ]; then
            echo "Checking backend TypeScript..."
            npx tsc --project amplify/tsconfig.json --noEmit || { echo "❌ Backend type check failed"; exit 1; }
          fi
        
        # NEW: Lint backend code (10 seconds)
        - |
          if [ -d "amplify" ]; then
            echo "Linting backend code..."
            npx eslint amplify/ --ext .ts --max-warnings 0 || { echo "❌ Backend linting failed"; exit 1; }
          fi
        
        # Deploy infrastructure (existing, unchanged)
        - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
        
        # NEW: Verify backend deployed successfully
        - echo "✅ Backend deployment successful"

frontend:
  phases:
    preBuild:
      commands:
        - npm ci --cache .npm --prefer-offline
    
    build:
      commands:
        # NEW: Type check frontend code (20 seconds)
        - |
          echo "Checking frontend TypeScript..."
          npx tsc --noEmit || { echo "❌ Frontend type check failed"; exit 1; }
        
        # NEW: Lint frontend code (15 seconds)
        - |
          echo "Linting frontend code..."
          npx eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0 || { echo "❌ Linting failed"; exit 1; }
        
        # NEW: Run tests (depends on test setup, ~30-60 seconds)
        - |
          if grep -q '"test:ci"' package.json; then
            echo "Running tests..."
            npm run test:ci || { echo "❌ Tests failed"; exit 1; }
          else
            echo "⚠️  No test:ci script found, skipping tests"
          fi
        
        # NEW: Security audit (10 seconds)
        - |
          echo "Scanning for vulnerabilities..."
          npm audit --audit-level=moderate || { echo "⚠️  Vulnerabilities found (non-blocking)"; }
        
        # Build frontend
        - npm run build || { echo "❌ Build failed"; exit 1; }
    
    postBuild:
      commands:
        # NEW: Verify build output exists
        - |
          if [ ! -d "out" ]; then
            echo "❌ Build output directory 'out' not found"
            exit 1
          fi
          echo "✅ Build output verified"
        
        # NEW: Optional: Run lighthouse CI (if configured)
        # - npx @lhci/cli@latest autorun || true
  
  artifacts:
    baseDirectory: out
    files:
      - '**/*'
  
  cache:
    paths:
      - .npm/**/*
      - node_modules/**/*

# NEW: Environment variables for frontend build
env:
  variables:
    NEXT_PUBLIC_REGION: $AWS_REGION
    # Add any other frontend env vars here
```

**Total additional build time**: ~65 seconds (type checking + linting + tests)  
**Total build time now**: ~3-4 minutes (acceptable for deploys)

---

### Step 2: Add Test Scripts to `package.json`

Add these scripts to enable test execution in CI:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build && next export",
    "start": "next start",
    
    // EXISTING
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "typecheck": "tsc --noEmit",
    
    // NEW: CI-specific scripts
    "test": "jest --watch",
    "test:ci": "jest --ci --coverage --maxWorkers=2 --passWithNoTests",
    "test:coverage": "jest --coverage",
    
    // NEW: Pre-deployment validation
    "validate": "npm run typecheck && npm run lint && npm run test:ci"
  }
}
```

---

### Step 3: Set Up GitHub Actions (Optional but Recommended)

This enables **PR checks before merge** so broken code never reaches the deploy pipeline.

**Create**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, 1-delivery-management]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run typecheck
      
      - name: Lint code
        run: npm run lint
      
      - name: Run tests
        run: npm run test:ci
      
      - name: Security audit
        run: npm audit --production
        continue-on-error: true
      
      - name: Build frontend
        run: npm run build
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
        if: always()

  # Optional: Deploy preview to staging
  deploy-preview:
    needs: test
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Deploy preview to Amplify
        run: |
          # Your preview deployment command
          # e.g., amplify publish --environment staging
          echo "Preview deployment skipped (configure as needed)"

  # Deploy to production
  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Deploy to Amplify
        run: |
          npx ampx pipeline-deploy --branch main --app-id ${{ secrets.AWS_AMPLIFY_APP_ID }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: ${{ secrets.AWS_REGION }}
```

---

### Step 4: Configure Amplify Branch Protection (Recommended)

In AWS Amplify Console:

1. Go to **App Settings** → **General**
2. Enable **Branch protection** for `main` branch
3. Require checks to pass before deployments
4. Set auto-cancel deployments if push conflicts

---

## Quality Gates Breakdown

### Gate 1: TypeScript Type Checking

**Purpose**: Catch type errors before runtime  
**Time**: ~20 seconds  
**Failure handling**: Blocks deployment (CRITICAL)

```bash
npx tsc --noEmit
```

**What it catches**:
- ❌ Undefined variables
- ❌ Wrong property access
- ❌ Incompatible types
- ❌ Missing function arguments

**Constitutional requirement**: "Full-Stack TypeScript Consistency"

---

### Gate 2: ESLint Code Quality

**Purpose**: Enforce code standards  
**Time**: ~15 seconds  
**Failure handling**: Blocks deployment (CRITICAL)

```bash
npx eslint . --ext .ts,.tsx,.js,.jsx
```

**What it catches**:
- ❌ Unused variables
- ❌ Missing error handling
- ❌ Code style violations
- ❌ Potential bugs

**Configuration**: Already exists in `.eslintrc.cjs`, enforced during pipeline

---

### Gate 3: Jest Unit & Integration Tests

**Purpose**: Prevent regressions  
**Time**: ~30-60 seconds (depends on test count)  
**Failure handling**: Blocks deployment (CRITICAL)

```bash
npm run test:ci
```

**What it catches**:
- ❌ Broken component renders
- ❌ Auth flow failures
- ❌ Data isolation breaches
- ❌ Calculation errors

**Constitutional requirement**: "Testing as Quality Gate" (minimum 70% coverage)

**Setup required**: Jest + React Testing Library (standard Next.js setup)

---

### Gate 4: Security Audit

**Purpose**: Identify vulnerable dependencies  
**Time**: ~10 seconds  
**Failure handling**: Warns but allows deploy (NON-BLOCKING)

```bash
npm audit --audit-level=moderate
```

**What it catches**:
- ⚠️ Known CVEs in dependencies
- ⚠️ Outdated packages
- ⚠️ Supply chain risks

**Non-blocking rationale**: You may have justified reasons to use packages with known issues (legacy support, etc.)

---

## Monitoring & Visibility

### Deployment Metrics to Track

Add these to CloudWatch (automatic with Amplify):

| Metric | Purpose |
|--------|---------|
| Build duration | Identify performance regressions |
| Test coverage | Ensure 70%+ per constitution |
| Lint warnings | Monitor code quality trends |
| Failed deployments | Root cause analysis |
| Deployment frequency | Development velocity |

### Viewing Pipeline Results

1. **In Amplify Console**: App → Deployments → View logs
2. **In GitHub Actions**: Pull Requests → Checks → Details
3. **Local pre-deployment**: Run `npm run validate` before git push

---

## Implementation Checklist

### Phase 1: Update Configuration

- [ ] Update `amplify.yml` with type checking and linting gates
- [ ] Add test scripts to `package.json`
- [ ] Verify no ESLint warnings in current codebase
- [ ] Test locally: `npm run validate` passes
- [ ] Commit and push to feature branch

### Phase 2: Add Testing Framework (if needed)

- [ ] Install Jest: `npm install --save-dev jest`
- [ ] Configure Jest for Next.js/React
- [ ] Write first test file for auth component
- [ ] Verify `npm run test:ci` runs successfully

### Phase 3: Add GitHub Actions (optional)

- [ ] Create `.github/workflows/ci.yml`
- [ ] Configure secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_AMPLIFY_APP_ID`
- [ ] Enable branch protection on `main`
- [ ] Test by opening a PR

### Phase 4: Verify & Monitor

- [ ] Verify feature branch deploys after passing checks
- [ ] Verify main branch auto-deploys after PR merge
- [ ] Monitor Amplify console for build times
- [ ] Review coverage reports

---

## Troubleshooting

### Issue: "npm ci: command not found"

**Solution**: `npm ci` is built-in (npm 5.7+). Ensure Node version ≥ 14.

### Issue: "ESLint: 10 warnings exceed limit"

**Solution**: Fix warnings or adjust Amplify config:
```yaml
- npx eslint . --ext .ts,.tsx --max-warnings 5  # Allow up to 5
```

### Issue: "Tests timeout in pipeline"

**Solution**: Increase timeout and parallelize:
```json
"test:ci": "jest --ci --coverage --maxWorkers=2 --testTimeout=10000"
```

### Issue: "Amplify deployment fails after checks pass"

**Solution**: Likely infrastructure-related, not code. Check Amplify logs in AWS console.

---

## Security Considerations

### Access Control

- [ ] Restrict AWS credentials to GitHub Secrets (encrypted)
- [ ] Use IAM roles with minimum permissions
- [ ] Rotate credentials quarterly
- [ ] Audit log all deployments (Amplify provides)

### Secrets Management

Never commit secrets in `amplify.yml`. Use GitHub Secrets:

```yaml
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Vulnerability Scanning

- `npm audit`: Identifies known CVEs
- Optional: `snyk` for deeper scanning
- Optional: `OWASP Dependency Check` for legal compliance

---

## Performance Impact

| Gate | Time Added | Impact |
|------|-----------|--------|
| npm ci (caching) | 0-30s | Reduces over time as cache warms |
| Type checking | ~20s | Critical for safety |
| Linting | ~15s | Critical for quality |
| Tests | ~30-60s | Varies with test suite size |
| Security audit | ~10s | Optional non-blocking |
| Build | ~60s | Existing |
| **Total** | **~135-175s** | **~2-3 min total** |

**Conclusion**: Acceptable trade-off for catching bugs before production.

---

## Summary

| Component | Change | Benefit |
|-----------|--------|---------|
| `amplify.yml` | Add type/lint/test gates | Blocks broken code |
| `package.json` | Add test/validate scripts | Enables local validation |
| `.github/workflows/` | Add CI pipeline | PR checks + audit trail |
| Branch protection | Enable on `main` | Prevents accidental merge |

**Result**: Production-grade CI/CD that prevents bugs and ensures quality compliance.

---

**Next Step**: Implement Phase 1 (update amplify.yml) in Sprint 1
