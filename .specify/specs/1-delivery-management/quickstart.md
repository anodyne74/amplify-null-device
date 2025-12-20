# Quickstart: Getting Started with Implementation

**Purpose**: Step-by-step guide to begin development  
**Target**: Complete within first 1-2 hours  
**Audience**: Developers on the team  
**Created**: 2025-12-20

---

## Pre-Implementation Checklist

Before starting Sprint 1, verify:

- [ ] **Node.js 18+** installed: `node --version`
- [ ] **npm 9+** installed: `npm --version`
- [ ] **AWS CLI** configured: `aws sts get-caller-identity`
- [ ] **Amplify CLI** installed: `npm list -g @aws-amplify/cli`
- [ ] **Git** ready: `git status` shows clean working tree
- [ ] **Feature branch** created: `git branch -a | grep 1-delivery`
- [ ] **Feature branch** checked out: `git status` shows `on branch 1-delivery-management`

---

## Part 1: Understanding the Architecture (30 minutes)

### Read Essential Documents

1. **Specification** (15 min): `.specify/specs/1-delivery-management/spec.md`
   - User stories 1-7
   - Functional requirements FR-001 through FR-020
   - Success criteria

2. **Data Model** (10 min): `.specify/specs/1-delivery-management/data-model.md`
   - Entity relationships
   - Customer/Route/Invoice structure
   - Data isolation strategy

3. **Implementation Plan** (5 min): `.specify/specs/1-delivery-management/plan.md`
   - Sprint overview
   - Technical decisions
   - Technology stack

### Key Concepts to Understand

**Data Isolation**:
- Every entity has a `customerId` field
- Customers can only see their own data
- Amplify GraphQL authorization enforces this at query layer

**Time Tracking** (Clarification Q2):
- Operator enters `estimatedDurationMinutes` during planning
- System records `actualStartTime` and `actualEndTime` when route is marked complete
- `actualDurationMinutes` is calculated automatically

**Billing** (Clarification Q1):
- Invoice charges = `actualDurationMinutes / 60` × `customer.billingRatePerHour`
- Rate changes apply only to future invoices (not retroactive)

**File Storage** (Clarification Q3):
- Invoices stored in S3 under `invoices/{customerId}/{invoiceId}.pdf`
- Access control enforced at API layer before generating signed URLs

---

## Part 2: Local Environment Setup (30 minutes)

### Step 1: Clone/Pull Latest Code

```bash
cd /home/dave/Code/amplify-null-device
git status  # Should show clean on 1-delivery-management branch
npm install  # Install dependencies
```

### Step 2: Verify Amplify Configuration

```bash
npx ampx env  # Check Amplify environment
# Should output: sandbox, dev, prod, etc.

cat amplify_outputs.json | jq '.auth'  # Verify Cognito config
# Should show userPoolId, appClientId, region
```

### Step 3: Start Development Server

```bash
npm run dev
# Output should show:
#   ▲ Next.js
#   - ready started server on 0.0.0.0:3000
```

### Step 4: Verify You Can Build

```bash
npm run build
npm run typecheck
npm run lint
# All should pass with no errors
```

### Step 5: Test Local Amplify Connection

```bash
# In a new terminal while dev server running:
curl http://localhost:3000
# Should return HTML (Next.js page)
```

---

## Part 3: Sprint 1 - Schema Implementation (2-4 hours)

### Task 1.1: Update Data Schema (1 hour)

**File**: `amplify/data/resource.ts`

**Current state**: 
```typescript
const schema = a.schema({
  Todo: a.model({...}),
});
```

**Target state**: Replace entire schema with 8 entities from `data-model.md`

**Steps**:
1. Open `amplify/data/resource.ts`
2. Copy the complete schema from `data-model.md` (Phase 1.1 section)
3. Replace the existing schema
4. Verify no syntax errors: `npx tsc --noEmit`

**Verification**:
```bash
npm run typecheck  # Should pass
# Output: (no errors)
```

### Task 1.2: Verify GraphQL Schema (30 minutes)

After updating the Amplify schema, test that it's valid:

```bash
cd amplify
npx tsc --noEmit  # Check backend types
cd ..

# The schema should compile without errors
```

### Task 1.3: Set Up Testing Infrastructure (30 minutes)

**Prerequisite**: Jest configuration

```bash
# Install testing dependencies
npm install --save-dev jest @testing-library/react @testing-library/jest-dom

# Create Jest config
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'next/babel',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    'app/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  testMatch: [
    '<rootDir>/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/**/__tests__/**/*.{js,jsx,ts,tsx}',
  ],
};
EOF

cat > jest.setup.js << 'EOF'
import '@testing-library/jest-dom';
EOF
```

**Add test script to package.json**:
```json
{
  "scripts": {
    "test": "jest --watch",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

### Task 1.4: Update CI/CD Configuration (30 minutes)

**File**: `amplify.yml`

Replace with enhanced version from `cicd-improvements.md` (Step 1 section).

**Verification**:
```bash
# Simulate what Amplify will run locally
npm run typecheck
npm run lint
# npm run test:ci  (if tests are ready)
npm run build
```

All should pass.

---

## Part 4: Creating Your First Component (1-2 hours)

### Create Customer Login Component

**File**: `app/components/CustomerLogin.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { signIn } from 'aws-amplify/auth';

export default function CustomerLogin() {
  return (
    <Authenticator>
      <div className="p-8">
        <h1>Welcome to Delivery Management</h1>
        <p>You are authenticated!</p>
      </div>
    </Authenticator>
  );
}
```

### Create Test File

**File**: `app/components/CustomerLogin.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import CustomerLogin from './CustomerLogin';

describe('CustomerLogin', () => {
  it('renders login component', () => {
    render(<CustomerLogin />);
    expect(screen.getByText('Welcome to Delivery Management')).toBeInTheDocument();
  });
});
```

### Run the Test

```bash
npm run test:ci
# Should show:
#  PASS  app/components/CustomerLogin.test.tsx
#  ✓ renders login component (XX ms)
#
# Test Suites: 1 passed, 1 total
```

---

## Part 5: Deployment Walkthrough (30 minutes)

### Deploy to Amplify Sandbox

```bash
# Amplify automatically watches for changes
# In Amplify Sandbox, your changes are deployed instantly

# To manually trigger:
npx ampx sandbox  # Starts local sandbox

# In another terminal:
npm run dev  # Starts Next.js dev server connected to sandbox
```

### Verify Cognito Integration

1. Open `http://localhost:3000`
2. Click "Login with Email"
3. Sign up: `test@example.com` / `TestPassword123!`
4. Verify authentication works

### Test Data Isolation

```typescript
// In your component, after login:
import { getCurrentUser } from 'aws-amplify/auth';

const user = await getCurrentUser();
console.log('Authenticated user:', user.userId);
// Should show Cognito user ID
```

---

## Part 6: Commit & Push (15 minutes)

### Stage Changes

```bash
git add amplify/data/resource.ts
git add amplify.yml
git add app/components/CustomerLogin.tsx
git add app/components/CustomerLogin.test.tsx
git add package.json  # Jest config
git add jest.config.js
git add jest.setup.js
```

### Write Commit Message

```bash
git commit -m "feat: implement delivery management schema and testing setup

- Add 8 entities to Amplify DataStore schema (Customer, Route, Invoice, etc.)
- Configure Jest and React Testing Library
- Add type checking and test gates to CI/CD pipeline
- Implement basic customer login component with tests

Relates to: 1-delivery-management"
```

### Push to Feature Branch

```bash
git push origin 1-delivery-management
```

### Create Pull Request

1. Go to GitHub: https://github.com/anodyne74/amplify-null-device/pulls
2. Click "New Pull Request"
3. Compare: `1-delivery-management` → `main`
4. Add description:
   ```
   # Sprint 1: Foundation - Schema & Testing Setup

   ## Changes
   - Implemented 8-entity Amplify DataStore schema
   - Added Jest/RTL testing framework
   - Enhanced CI/CD with quality gates
   - Created basic login component

   ## Testing
   - [x] Type checking passes
   - [x] Linting passes
   - [x] Tests run successfully
   - [x] Build succeeds
   - [x] Local dev server runs

   Closes #[issue-number]
   ```
5. Click "Create Pull Request"

---

## Verification Checklist

After completing Part 1-6, you should be able to verify:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:ci` passes with at least 1 test
- [ ] `npm run build` succeeds
- [ ] `npm run dev` starts without errors
- [ ] Local login works (test@example.com)
- [ ] Git branch has all changes staged
- [ ] PR created on GitHub
- [ ] Branch protection requires PR review (if enabled)

---

## Common Issues & Solutions

### Issue: "Cannot find module '@aws-amplify/ui-react'"

**Solution**:
```bash
npm install @aws-amplify/ui-react @aws-amplify/ui
```

### Issue: "Jest: Unknown file extension '.tsx'"

**Solution**: Ensure `jest.config.js` exists with proper preset:
```javascript
module.exports = {
  preset: 'next/babel',
  // ... rest of config
};
```

### Issue: "Amplify: Failed to authenticate"

**Solution**: Check Amplify outputs:
```bash
cat amplify_outputs.json | jq .auth
# Verify userPoolId and appClientId are populated
```

### Issue: "npm run lint shows many warnings"

**Solution**: Run ESLint fix:
```bash
npm run lint -- --fix
```

---

## Next Steps After Sprint 1

Once PR is merged to main:

1. **Sprint 2**: Implement customer portal UI
   - Route list & detail views
   - Invoice list & filtering
   - Statistics dashboard

2. **Sprint 3**: Implement operator portal
   - Customer account management
   - Route planning with stops
   - Route status management

3. **Sprint 4**: Implement billing
   - Invoice calculation logic
   - PDF generation
   - S3 file storage with signed URLs

4. **Sprint 5**: Security & audit
   - AuditLog implementation
   - Cross-customer access prevention tests
   - Data isolation verification

5. **Sprint 6**: Launch preparation
   - End-to-end testing
   - Performance optimization
   - Documentation & deployment

---

## Reference Documents

**Always available in your feature branch**:
- `.specify/specs/1-delivery-management/spec.md` - Complete specification
- `.specify/specs/1-delivery-management/plan.md` - Implementation plan
- `.specify/specs/1-delivery-management/data-model.md` - Data model
- `.specify/specs/1-delivery-management/cicd-improvements.md` - CI/CD guide
- `.specify/memory/constitution.md` - Project constitution & principles

**External References**:
- [AWS Amplify Gen2 Docs](https://docs.amplify.aws)
- [Amplify Data Schema](https://docs.amplify.aws/gen2/build-a-backend/data/define-model)
- [Next.js Docs](https://nextjs.org/docs)
- [Jest Testing](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)

---

**Estimated Time**: 6-8 hours for Part 1-6  
**Expected Outcome**: Working schema, tests, and CI/CD pipeline  
**Success**: Green checkmarks on all PR checks

---

**Questions?** Refer back to the specification documents or create a GitHub issue.
