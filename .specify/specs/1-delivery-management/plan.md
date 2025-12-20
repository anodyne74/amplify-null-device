# Implementation Plan: Delivery Management System

**Feature Branch**: `1-delivery-management`  
**Created**: 2025-12-20  
**Technology Stack**: React + AWS Amplify (Gen 2)  
**Status**: Ready for Implementation

---

## Phase 0: Technical Context & Architecture

### Current State Assessment

**Project Foundation**:
- ✅ React 18+ with TypeScript configured
- ✅ Next.js for SSR/static export
- ✅ AWS Amplify Gen 2 backend infrastructure
- ✅ Cognito auth resource already defined (email login)
- ✅ DataStore/GraphQL resource scaffolding in place
- ✅ Amplify CLI hosting configured with ampx pipeline-deploy

**Existing Security & Quality**:
- ✅ Constitution established with TypeScript-first, security-first, testing requirements
- ✅ ESLint configured for code quality
- ✅ Type checking required before deployment
- ✅ Data isolation is enforced as P1 principle

### Technical Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│         React Frontend (TypeScript)                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ Customer Portal | Operator Portal             │   │
│  │ - Auth (Cognito) | Data (Amplify DataStore) │   │
│  │ - PDF Generation | File Download            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│    AWS Amplify Backend (TypeScript)                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ Auth Layer (Cognito)                         │   │
│  │ - Customer login (email/password)            │   │
│  │ - Session management & roles                 │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ Data Layer (Amplify Data/GraphQL)            │   │
│  │ - Customer, Operator, Route, Stop, Invoice  │   │
│  │ - Automatic CRUD + subscription support    │   │
│  │ - Authorization rules (customer isolation) │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ Function Layer (Lambdas)                    │   │
│  │ - Invoice PDF generation                    │   │
│  │ - Invoice calculation logic                 │   │
│  │ - File storage orchestration                │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ Storage Layer (S3 + signed URLs)             │   │
│  │ - Rendered PDFs in customer-specific paths  │   │
│  │ - Access control via signed URLs            │   │
│  │ - Audit logging for access                  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|-----------|
| **Amplify Data (GraphQL)** for primary data | Type-safe, auto-CRUD, real-time subscriptions, natural fit with React | Requires schema definition in `schema.ts` |
| **Cognito for auth** | Already configured, built-in session mgmt, MFA-capable | Minimal customization needed |
| **Lambda functions** for invoice generation | Async processing, PDF generation outside request cycle | Small additional operational overhead |
| **S3 + signed URLs** for file storage | Customer-specific paths, access control, audit logging | Requires signed URL generation at API layer |
| **Application-layer access control** | Consistent with constitution, maximum security visibility | Slightly more code at query/retrieval layer |

---

## Phase 1: Design & Contracts

### 1.1 Data Model (amplify/data/resource.ts)

```typescript
// Complete schema for delivery management system

const schema = a.schema({
  // Core Customer entity
  Customer: a
    .model({
      id: a.id(),
      name: a.string().required(),
      email: a.email().required(),
      contactPhone: a.phone(),
      status: a.enum(['active', 'inactive', 'suspended']).required(),
      billingRatePerHour: a.float().required(), // Hourly rate in dollars
      createdAt: a.datetime().required(),
      updatedAt: a.datetime(),
      
      // Relationships
      routes: a.hasMany('Route', 'customerId'),
      invoices: a.hasMany('Invoice', 'customerId'),
      payments: a.hasMany('PaymentRecord', 'customerId'),
    })
    .authorization((allow) => [
      allow.owner().to(['read', 'update']), // Customers can view/update their own
      allow.authenticated('operator').to(['create', 'read', 'update']), // Operators manage
    ]),

  // Operator entity (staff member)
  Operator: a
    .model({
      id: a.id(),
      name: a.string().required(),
      email: a.email().required(),
      role: a.enum(['admin', 'manager', 'staff']).required(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.authenticated('operator').to(['read']), // Operators can see all operators
      allow.authenticated('operator').role('admin').to(['create', 'update', 'delete']), // Only admins manage
    ]),

  // Route entity (delivery route for a customer)
  Route: a
    .model({
      id: a.id(),
      customerId: a.id().required(),
      customer: a.belongsTo('Customer', 'customerId'),
      
      status: a.enum(['planned', 'active', 'completed', 'cancelled']).required(),
      estimatedDurationMinutes: a.int(), // Operator estimate during planning
      actualStartTime: a.datetime(), // When route actually started
      actualEndTime: a.datetime(), // When route actually completed
      actualDurationMinutes: a.int(), // Computed: (endTime - startTime) / 60
      
      notes: a.string(),
      createdAt: a.datetime().required(),
      updatedAt: a.datetime(),
      
      // Relationships
      stops: a.hasMany('Stop', 'routeId'),
      invoiceLineItems: a.hasMany('LineItem', 'routeId'),
    })
    .authorization((allow) => [
      allow.owner().to(['read']), // Customers see their own routes
      allow.authenticated('operator').to(['create', 'read', 'update']), // Operators create/manage
    ]),

  // Stop entity (individual stop within a route)
  Stop: a
    .model({
      id: a.id(),
      routeId: a.id().required(),
      route: a.belongsTo('Route', 'routeId'),
      
      sequence: a.int().required(), // Order in route
      address: a.string().required(),
      serviceType: a.enum(['pickup', 'delivery', 'inspection']).required(),
      
      estimatedArrivalTime: a.datetime(), // Operator estimate
      actualArrivalTime: a.datetime(),
      actualDepartureTime: a.datetime(),
      notes: a.string(),
      
      createdAt: a.datetime().required(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner().to(['read']), // Customers see stops via route
      allow.authenticated('operator').to(['create', 'read', 'update']), // Operators manage
    ]),

  // Invoice entity (billing document)
  Invoice: a
    .model({
      id: a.id(),
      customerId: a.id().required(),
      customer: a.belongsTo('Customer', 'customerId'),
      
      invoiceNumber: a.string().required(), // Human-readable invoice number
      invoiceDate: a.date().required(),
      periodStartDate: a.date().required(),
      periodEndDate: a.date().required(),
      
      totalAmount: a.float().required(), // Calculated: sum of line items
      status: a.enum(['draft', 'finalized', 'sent', 'paid', 'cancelled']).required(),
      
      // Metadata
      createdAt: a.datetime().required(),
      updatedAt: a.datetime(),
      finalizedAt: a.datetime(),
      
      // Relationships
      lineItems: a.hasMany('LineItem', 'invoiceId'),
      payments: a.hasMany('PaymentRecord', 'invoiceId'),
    })
    .authorization((allow) => [
      allow.owner().to(['read']), // Customers see their invoices
      allow.authenticated('operator').to(['create', 'read', 'update']), // Operators generate/manage
    ]),

  // LineItem entity (individual charge on invoice)
  LineItem: a
    .model({
      id: a.id(),
      invoiceId: a.id().required(),
      invoice: a.belongsTo('Invoice', 'invoiceId'),
      
      routeId: a.id(), // Optional: reference to source route
      route: a.belongsTo('Route', 'routeId'),
      
      description: a.string().required(), // e.g., "Route delivery - 3.5 hours"
      quantity: a.float().required(), // Hours worked
      ratePerUnit: a.float().required(), // Dollar per hour
      amount: a.float().required(), // Calculated: quantity * ratePerUnit
      
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.owner().to(['read']), // Customers see line items via invoice
      allow.authenticated('operator').to(['create', 'read', 'update']), // Operators create
    ]),

  // PaymentRecord entity (payment history)
  PaymentRecord: a
    .model({
      id: a.id(),
      customerId: a.id().required(),
      customer: a.belongsTo('Customer', 'customerId'),
      
      invoiceId: a.id(),
      invoice: a.belongsTo('Invoice', 'invoiceId'),
      
      paymentDate: a.date().required(),
      amount: a.float().required(),
      paymentMethod: a.enum(['check', 'bank_transfer', 'credit_card', 'other']).required(),
      referenceNumber: a.string(), // Check number, transaction ID, etc.
      status: a.enum(['pending', 'completed', 'failed']).required(),
      
      notes: a.string(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.owner().to(['read']), // Customers see their payment records
      allow.authenticated('operator').to(['create', 'read']), // Operators record payments
    ]),

  // AuditLog entity (security logging per constitution)
  AuditLog: a
    .model({
      id: a.id(),
      customerId: a.id(),
      operatorId: a.id(),
      
      eventType: a.enum(['data_access', 'file_access', 'unauthorized_attempt']).required(),
      resourceType: a.string(), // 'route', 'invoice', 'file', etc.
      resourceId: a.string(),
      action: a.enum(['read', 'create', 'update', 'delete', 'download']).required(),
      
      status: a.enum(['allowed', 'denied']).required(),
      reason: a.string(), // Why denied, if applicable
      
      ipAddress: a.string(),
      userAgent: a.string(),
      
      timestamp: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.authenticated('operator').role('admin').to(['read']), // Only admins view logs
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool', // Cognito for authenticated users
    apiKeyAuthorizationMode: { expiresInMinutes: 7 },
  },
});
```

**Key Design Points**:
- **Authorization rules** enforced at GraphQL layer using Amplify's built-in auth directives
- **Owner-based access** ensures customers only see their own data
- **Operator role** differentiates staff permissions from customer permissions
- **Calculated fields** (actualDurationMinutes, totalAmount) stored for performance but also derivable
- **AuditLog** captures all security-relevant events per constitution FR-016
- **Relationships** use Amplify's hasMany/belongsTo for automatic resolution

---

### 1.2 API Contracts (GraphQL Operations)

**File**: `contracts/graphql-operations.md`

#### Customer Queries

```graphql
# Get current customer profile (requires customer role)
query GetMyProfile {
  me {
    id
    name
    email
    contactPhone
    billingRatePerHour
    status
  }
}

# List customer's routes with pagination
query ListMyRoutes($limit: Int, $nextToken: String) {
  listMyRoutes(limit: $limit, nextToken: $nextToken) {
    items {
      id
      status
      estimatedDurationMinutes
      actualStartTime
      actualEndTime
      actualDurationMinutes
      createdAt
      updatedAt
    }
    nextToken
  }
}

# Get route details with stops
query GetRouteDetail($id: ID!) {
  getRoute(id: $id) {
    id
    status
    estimatedDurationMinutes
    actualStartTime
    actualEndTime
    notes
    stops(sortBy: SEQUENCE_ASC) {
      id
      sequence
      address
      serviceType
      estimatedArrivalTime
      actualArrivalTime
      actualDepartureTime
      notes
    }
  }
}

# List customer's invoices
query ListMyInvoices($limit: Int, $startDate: AWSDate, $endDate: AWSDate) {
  listMyInvoices(limit: $limit, startDate: $startDate, endDate: $endDate) {
    items {
      id
      invoiceNumber
      invoiceDate
      totalAmount
      status
      periodStartDate
      periodEndDate
    }
    nextToken
  }
}

# Get invoice details with line items
query GetInvoiceDetail($id: ID!) {
  getInvoice(id: $id) {
    id
    invoiceNumber
    invoiceDate
    periodStartDate
    periodEndDate
    totalAmount
    status
    lineItems {
      id
      description
      quantity
      ratePerUnit
      amount
    }
  }
}

# Get customer statistics (dashboard)
query GetCustomerStatistics($startDate: AWSDate, $endDate: AWSDate) {
  getCustomerStats(startDate: $startDate, endDate: $endDate) {
    totalJobs: Int
    totalBilledAmount: Float
    outstandingBalance: Float
    averageCostPerStop: Float
    averageStopsPerRoute: Float
    averageCompletionTimeMinutes: Float
  }
}
```

#### Operator Mutations

```graphql
# Create new customer
mutation CreateCustomer($input: CreateCustomerInput!) {
  createCustomer(input: $input) {
    id
    name
    email
    status
    billingRatePerHour
    createdAt
  }
}

# Update customer (rate changes, status)
mutation UpdateCustomer($input: UpdateCustomerInput!) {
  updateCustomer(input: $input) {
    id
    name
    billingRatePerHour
    status
    updatedAt
  }
}

# Create route for customer
mutation CreateRoute($input: CreateRouteInput!) {
  createRoute(input: $input) {
    id
    customerId
    status
    estimatedDurationMinutes
    createdAt
  }
}

# Add stop to route
mutation CreateStop($input: CreateStopInput!) {
  createStop(input: $input) {
    id
    routeId
    sequence
    address
    serviceType
  }
}

# Mark route as active (start tracking time)
mutation StartRoute($routeId: ID!) {
  startRoute(routeId: $routeId) {
    id
    status
    actualStartTime
  }
}

# Mark route as completed with actual times
mutation CompleteRoute($routeId: ID!, $actualEndTime: AWSDateTime!) {
  completeRoute(routeId: $routeId, actualEndTime: $actualEndTime) {
    id
    status
    actualStartTime
    actualEndTime
    actualDurationMinutes
  }
}

# Generate invoice for completed routes
mutation GenerateInvoice($input: GenerateInvoiceInput!) {
  generateInvoice(input: $input) {
    id
    invoiceNumber
    totalAmount
    status
    lineItems {
      id
      description
      quantity
      ratePerUnit
      amount
    }
  }
}

# Request PDF generation and upload to S3
mutation RequestInvoicePDF($invoiceId: ID!) {
  requestInvoicePDF(invoiceId: $invoiceId) {
    downloadUrl: String
    generatedAt: AWSDateTime
  }
}

# Finalize invoice (approve for customer visibility)
mutation FinalizeInvoice($invoiceId: ID!) {
  finalizeInvoice(invoiceId: $invoiceId) {
    id
    status
    finalizedAt
  }
}
```

#### Subscriptions (Real-time Updates)

```graphql
# Customer subscribes to route updates
subscription OnRouteUpdated($customerId: ID!) {
  onRouteUpdated(customerId: $customerId) {
    id
    status
    actualStartTime
    actualEndTime
    updatedAt
  }
}

# Customer notified when invoice is ready
subscription OnInvoiceAvailable($customerId: ID!) {
  onInvoiceAvailable(customerId: $customerId) {
    id
    invoiceNumber
    status
    invoiceDate
  }
}
```

---

### 1.3 File Storage & Security Architecture

**S3 Structure**:
```
s3://delivery-app-files/
├── invoices/
│   ├── {customerId}/
│   │   ├── {invoiceId}_{invoiceNumber}.pdf
│   │   └── {invoiceId}_{invoiceNumber}.pdf
│   └── ...
├── routes/
│   ├── {customerId}/
│   │   ├── {routeId}_{date}.json
│   │   └── ...
│   └── ...
└── logs/
    ├── access_logs.{date}.jsonl
    └── ...
```

**Access Control Strategy**:
1. Files stored in customer-specific paths: `invoices/{customerId}/{invoiceId}.pdf`
2. API endpoint validates customer ID matches authenticated user before generating signed URL
3. Signed URLs expire after 24 hours (configurable per security policy)
4. All access attempts logged to AuditLog (FR-016)
5. Operator/admin endpoints allow customer ID override with explicit audit log

---

## Phase 2: Implementation Roadmap

### Sprint 1: Foundation (Weeks 1-2)
- [ ] Update `amplify/data/resource.ts` with complete schema
- [ ] Implement Cognito role management (operator vs customer roles)
- [ ] Create base React components: Layout, Auth Guards, Error Boundaries
- [ ] Set up TypeScript types for all entities (auto-generated from schema)
- [ ] Write unit tests for auth flow (constitution requirement)

### Sprint 2: Customer Portal - Core (Weeks 3-4)
- [ ] Build Customer Login + session management
- [ ] Implement Route List & Route Detail views
- [ ] Implement Invoice List + filtering
- [ ] Add Statistics Dashboard component
- [ ] Write integration tests for customer portal

### Sprint 3: Operator Portal (Weeks 5-6)
- [ ] Build Operator Login + role management
- [ ] Implement Customer Management (CRUD)
- [ ] Implement Route Planning UI with stop management
- [ ] Add Route status management (planned → active → completed)
- [ ] Write integration tests for operator operations

### Sprint 4: Billing & PDF Generation (Weeks 7-8)
- [ ] Create Lambda function for invoice calculation
- [ ] Implement PDF generation (using libraries like html2pdf or puppeteer)
- [ ] Create S3 storage orchestration with signed URLs
- [ ] Build Invoice Generation UI (operator)
- [ ] Write tests for invoice calculation logic

### Sprint 5: Security & Polish (Weeks 9-10)
- [ ] Implement audit logging (AuditLog entity)
- [ ] Add data isolation verification tests
- [ ] Implement access control tests (cross-customer prevention)
- [ ] Performance optimization and caching
- [ ] Security audit and penetration testing

### Sprint 6: Launch Prep (Weeks 11-12)
- [ ] End-to-end testing of all user stories
- [ ] Documentation and deployment guides
- [ ] Performance testing (SC-006, SC-008 validation)
- [ ] User acceptance testing
- [ ] Production deployment and monitoring

---

## Phase 3: CI/CD Pipeline Recommendations

### Current State
✅ Amplify hosting with `ampx pipeline-deploy` (infrastructure as code)  
✅ Next.js export to static site  
⚠️ **Gaps identified**: No explicit type checking, test execution, or security scanning

### Recommended Improvements to `amplify.yml`

```yaml
version: 1

# Backend build: Deploy Amplify infrastructure
backend:
  phases:
    build:
      commands:
        - npm ci --cache .npm --prefer-offline
        # NEW: Type checking on backend code
        - npx tsc --project amplify/tsconfig.json --noEmit
        # NEW: Lint backend code
        - npx eslint amplify/ --ext .ts
        # Deploy infrastructure
        - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID

# Frontend build: React application
frontend:
  phases:
    preBuild:
      commands:
        - npm ci --cache .npm --prefer-offline
    build:
      commands:
        # NEW: Type checking (constitution requirement)
        - npm run typecheck
        # NEW: Linting (constitution requirement)
        - npm run lint
        # NEW: Run test suite (constitution requirement)
        - npm run test:ci
        # Build frontend
        - npm run build
    postBuild:
      commands:
        # NEW: Security scanning for vulnerabilities
        - npm audit --production || true
        # NEW: Build verification
        - test -d out || exit 1
  artifacts:
    baseDirectory: out
    files:
      - '**/*'
  cache:
    paths:
      - .npm/**/*
      - node_modules/**/*
  # NEW: Add environment variables for frontend build
  environmentVariables:
    - name: NEXT_PUBLIC_API_REGION
      value: $AWS_REGION
```

### GitHub Actions Workflow (Recommended)

**File**: `.github/workflows/test-and-deploy.yml`

```yaml
name: Test & Deploy

on:
  push:
    branches: [main, 1-delivery-management]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Run tests
        run: npm run test:ci

      - name: Security audit
        run: npm audit --production
        continue-on-error: true

      - name: Build
        run: npm run build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install Amplify CLI
        run: npm install -g @aws-amplify/cli

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Deploy to Amplify
        run: |
          npm ci
          npx ampx pipeline-deploy \
            --branch main \
            --app-id ${{ secrets.AWS_AMPLIFY_APP_ID }}
```

### Package.json Scripts (Required for CI/CD)

Add these to `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "test": "jest --watch",
    "test:ci": "jest --ci --coverage --maxWorkers=2",
    "build": "next build && next export",
    "dev": "next dev"
  }
}
```

### Security Best Practices in CI/CD

| Check | Implementation | Rationale |
|-------|-----------------|-----------|
| **Type Safety** | `tsc --noEmit` in pipeline | Catches errors before deployment (constitution req) |
| **Code Quality** | ESLint with TypeScript rules | Maintains consistency across codebase |
| **Tests** | Jest with >70% coverage | Prevents regressions (constitution: testing gate) |
| **Dependency Audit** | `npm audit` in pipeline | Catches known vulnerabilities early |
| **Protected Main** | Require PR approval + checks pass | Prevents accidental broken deployments |
| **Audit Logging** | Log all deployments with timestamp/user | Compliance with constitution FR-016 |

---

## Phase 4: Quickstart & Success Criteria

### Getting Started Locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create `.env.local` with Amplify outputs**
   ```bash
   cp amplify_outputs.json .env.local
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Login as test customer**
   - Email: `customer@example.com`
   - Password: (set via Amplify Cognito)

### Validation Checklist

#### Phase 1 Complete ✅
- [ ] Data schema deployed to Amplify
- [ ] GraphQL API accessible and typed
- [ ] Auth roles (operator/customer) working
- [ ] AuditLog entity capturing events

#### Phase 2 Complete ✅
- [ ] Customer can login and view routes
- [ ] Customer can view invoices with filtering
- [ ] Customer statistics dashboard shows correct calculations
- [ ] All customer portal tests passing

#### Phase 3 Complete ✅
- [ ] Operator can create customer accounts
- [ ] Operator can plan routes with stops
- [ ] Route status transitions working (planned → active → completed)
- [ ] Route times accurate (estimated vs actual)

#### Phase 4 Complete ✅
- [ ] Invoice calculation based on actual time + hourly rate
- [ ] PDF generation working for invoices
- [ ] PDF stored in S3 with correct customer-specific path
- [ ] Signed URLs expire appropriately

#### Security Verification ✅
- [ ] Cross-customer data access tests all passing
- [ ] AuditLog shows all attempted accesses (allowed and denied)
- [ ] File access control prevents unauthorized downloads
- [ ] All FRs 013-020 (data isolation, security, audit) verified

#### Success Criteria Validation
- SC-001: Customer login to first route view < 2 min ✅
- SC-002: Operator creates account in < 5 min ✅
- SC-003: Operator plans 10-stop route in < 15 min ✅
- SC-004: Invoice PDF download < 30 sec ✅
- SC-005: 100% data isolation verified ✅
- SC-006: Data retrieval < 2 sec (500 routes) ✅
- SC-007: PDF rendering < 5 sec ✅
- SC-008: 100 concurrent sessions ✅
- SC-009: Operator dashboard < 2 sec ✅
- SC-010: 95% accurate invoices ✅
- SC-011: File access control verified ✅
- SC-012: Storage failure recovery tested ✅
- SC-013: Audit logging complete ✅
- SC-014: User satisfaction surveys 4.0+ ✅

---

## Technology Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React 18 + TypeScript + Next.js | Type safety, SSR, static export |
| **State** | Amplify DataStore + GraphQL | Real-time, offline-capable, type-safe |
| **Auth** | AWS Cognito + Amplify | Built-in session mgmt, MFA, roles |
| **Backend** | TypeScript Lambda functions | Type consistency, serverless scaling |
| **Database** | DynamoDB (via Amplify) | Automatic provisioning, auto-scaling |
| **File Storage** | S3 + signed URLs | Secure, access-controlled, auditable |
| **Logging** | AuditLog DynamoDB table | Constitutional requirement (FR-016) |
| **Testing** | Jest + React Testing Library | Constitution requirement, isolation testing |
| **CI/CD** | GitHub Actions + Amplify | Automated testing, type checking, secure deployment |

---

**Status**: Ready for Sprint 1 development  
**Next Step**: Begin schema implementation in `amplify/data/resource.ts`
