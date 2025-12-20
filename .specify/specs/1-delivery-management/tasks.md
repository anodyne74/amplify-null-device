# Tasks: Delivery Management System

**Feature Branch**: `1-delivery-management`  
**Created**: 2025-12-20  
**Input**: Specification from `spec.md`, Plan from `plan.md`, Data model from `data-model.md`  
**Status**: Ready for implementation

---

## Task Organization

Tasks are organized by **Sprint** and then by **User Story** to enable independent implementation and testing. Each user story represents an independently deployable increment.

**Task Format**: `- [ ] [ID] [P?] [Story] Description with file path`

- `[ID]`: Task identifier (T001, T002, etc. in execution order)
- `[P]`: Optional - task can run in parallel (different files/no dependencies)
- `[Story]`: Which user story (US1, US2, etc.) - omitted for setup/foundational phases
- `Description`: Clear action with specific file path

---

## Phase 0: Setup & Configuration (Weeks 0-1)

**Goal**: Establish project infrastructure, dependencies, and CI/CD foundations  
**Owner**: Tech Lead  
**Validation**: All commands run without errors, no TypeScript warnings

### Setup Tasks

- [ ] T001 Install testing dependencies: npm install --save-dev jest @testing-library/react @testing-library/jest-dom ts-jest @testing-library/jest-dom

- [ ] T002 [P] Create Jest configuration file at `jest.config.js` with Next.js preset, jsdom environment, and coverage settings

- [ ] T003 [P] Create Jest setup file at `jest.setup.js` importing @testing-library/jest-dom

- [ ] T004 [P] Update `package.json` scripts to add: "test": "jest --watch", "test:ci": "jest --ci --coverage --maxWorkers=2 --passWithNoTests"

- [ ] T005 [P] Create `.github/workflows/ci.yml` with GitHub Actions workflow for type checking, linting, testing, and security scanning

- [ ] T006 Update `amplify.yml` with quality gates: add tsc type checking, eslint linting, and jest test execution before and after build steps (per cicd-improvements.md Step 1)

- [ ] T007 [P] Create `.env.local.example` documenting required environment variables (NEXT_PUBLIC_API_REGION, etc.)

- [ ] T008 [P] Update `.gitignore` to exclude node_modules, .next, coverage, .amplify directories

- [ ] T009 Run `npm run typecheck` and verify zero errors; run `npm run lint` and fix all warnings

- [ ] T010 Run local dev server: `npm run dev` and verify it starts on http://localhost:3000 without errors

---

## Phase 1: Data Model & Backend Foundation (Weeks 1-2)

**Goal**: Implement Amplify Data schema with 8 entities and Cognito role configuration  
**Owner**: Backend Developer  
**Independent Test**: Schema compiles, GraphQL API accessible, authorization rules enforced  
**Success**: `npx tsc --noEmit` passes for amplify/ directory

### Data Model & Schema

- [ ] T011 [P] Backup current `amplify/data/resource.ts` and create complete schema (data-model.md Phase 1.1) with 8 entities: Customer, Operator, Route, Stop, Invoice, LineItem, PaymentRecord, AuditLog

- [ ] T012 [P] Implement Customer entity in schema with fields: id, name, email, contactPhone, status, billingRatePerHour, timestamps, and relationships to routes/invoices/payments

- [ ] T013 [P] Implement Operator entity with fields: id, name, email, role (admin/manager/staff), createdAt, and authorization rules

- [ ] T014 [P] Implement Route entity with fields: id, customerId, status, estimatedDurationMinutes, actualStartTime, actualEndTime, actualDurationMinutes, notes, timestamps, and hasMany(Stop) relationship

- [ ] T015 [P] Implement Stop entity with fields: id, routeId, sequence, address, serviceType, estimatedArrivalTime, actualArrivalTime, actualDepartureTime, notes, timestamps, and belongsTo(Route) relationship

- [ ] T016 [P] Implement Invoice entity with fields: id, customerId, invoiceNumber, invoiceDate, periodStartDate, periodEndDate, totalAmount, status, timestamps, and hasMany(LineItem) relationship

- [ ] T017 [P] Implement LineItem entity with fields: id, invoiceId, routeId, description, quantity, ratePerUnit, amount, createdAt, and belongsTo(Invoice) relationship

- [ ] T018 [P] Implement PaymentRecord entity with fields: id, customerId, invoiceId, paymentDate, amount, paymentMethod, referenceNumber, status, notes, createdAt

- [ ] T019 [P] Implement AuditLog entity with fields: id, customerId, operatorId, eventType, resourceType, resourceId, action, status, reason, ipAddress, userAgent, timestamp

- [ ] T020 Verify schema compiles: `cd amplify && npx tsc --noEmit` with zero errors

### Cognito Configuration

- [ ] T021 [P] Update `amplify/auth/resource.ts` to configure email-based authentication (already exists, verify)

- [ ] T022 Configure custom Cognito attributes for operator role: `amplify env add` and update auth resource to support role claim in tokens

- [ ] T023 Create Cognito user groups: "customer" (default) and "operator" (staff members); add authorization rules to use these groups

- [ ] T024 Test Cognito integration locally: `npx ampx sandbox` and verify Cognito User Pool is accessible

### Backend Type Definitions

- [ ] T025 [P] Generate TypeScript types from Amplify schema: `npx ampx codegen` (auto-generates `amplify/types/`)

- [ ] T026 [P] Export Schema type from `amplify/data/resource.ts` for use in frontend code generation

- [ ] T027 Create utility functions in `lib/amplify-config.ts`: configureAmplify(), isCustomer(), isOperator() for checking user roles

- [ ] T028 Write unit test for utility functions in `lib/amplify-config.test.ts` covering role detection logic

---

## Phase 2: Frontend Foundation (Weeks 2-3)

**Goal**: Set up base React components, authentication guards, and layout structure  
**Owner**: Frontend Developer  
**Independent Test**: Components render without errors, auth flow works  
**Success**: `npm run typecheck` and `npm run build` pass

### Layout & Authentication Components

- [ ] T029 [P] Create `app/layout.tsx` (root layout) with Amplify provider, Authenticator wrapper, and error boundary

- [ ] T030 [P] Create `app/components/ProtectedRoute.tsx` for customer-protected pages (redirects unauthenticated users to login)

- [ ] T031 [P] Create `app/components/OperatorRoute.tsx` for operator-protected pages (redirects non-operators to customer portal)

- [ ] T032 [P] Create `app/components/ErrorBoundary.tsx` for catching and displaying React errors

- [ ] T033 [P] Create `app/components/LoadingSpinner.tsx` for showing loading states during data fetch

- [ ] T034 [P] Create `app/types/index.ts` with TypeScript interfaces for Customer, Route, Invoice, etc. (aligned with GraphQL types)

- [ ] T035 Write unit tests for components in `app/components/*.test.tsx` (ProtectedRoute, OperatorRoute, ErrorBoundary)

### Customer Login Flow

- [ ] T036 Create `app/page.tsx` (home page) that redirects authenticated customers to `/customer/dashboard` and operators to `/operator/dashboard`

- [ ] T037 Create `app/customer/layout.tsx` (customer portal layout) with navbar, sidebar, logout button, responsive design

- [ ] T038 Create `app/operator/layout.tsx` (operator portal layout) with admin menu, navigation, role indicators

- [ ] T039 Test login flow manually: signup → verify email → login → redirected to correct dashboard

---

## User Story 1: Customer Login & Route Viewing (P1) - Weeks 3-4

**Story Goal**: Customers can log in and view their routes (current/historical)  
**Independent Test**: Create test customer, login, verify route list visible  
**Success Criteria**: SC-001 (login within 2 min), all routes visible

### Authentication & Login

- [ ] T040 [US1] Create `app/customer/page.tsx` redirect to `/customer/dashboard`

- [ ] T041 [US1] Verify Authenticator component handles customer login with email/password (part of app/layout.tsx from T029)

- [ ] T042 [US1] Write integration test for customer login flow in `app/customer/__tests__/login.test.tsx`: signup, verify email, login success

- [ ] T043 [US1] [P] Create `app/auth/session.ts` utility to get current authenticated customer and verify customerId matches URL parameter

- [ ] T044 [US1] [P] Write unit test for session utility in `app/auth/session.test.ts` covering customer ID extraction

### Route List View

- [ ] T045 [US1] Create GraphQL query `queries/ListMyRoutes.ts` to fetch customer's routes with pagination (from plan.md API contracts)

- [ ] T046 [US1] Create `app/customer/routes/page.tsx` (route list) displaying: status, duration, dates, action buttons

- [ ] T047 [US1] Create `app/customer/components/RouteListItem.tsx` component for individual route display (reusable)

- [ ] T048 [US1] Implement route filtering/sorting by status (planned/active/completed) and date in route list

- [ ] T049 [US1] [P] Write unit test for RouteListItem component: renders route data, status label, action buttons

- [ ] T050 [US1] [P] Write integration test for route list page: fetches routes, displays in table, click opens detail view

### Route Detail View

- [ ] T051 [US1] Create GraphQL query `queries/GetRouteDetail.ts` to fetch single route with stops (from plan.md)

- [ ] T052 [US1] Create `app/customer/routes/[id]/page.tsx` (route detail) showing: status, timeline, stops (ordered by sequence)

- [ ] T053 [US1] Create `app/customer/components/StopListItem.tsx` for individual stop display (address, service type, times, notes)

- [ ] T054 [US1] Create `app/customer/components/RouteTimeline.tsx` component showing visual timeline of route progress (estimated vs actual)

- [ ] T055 [US1] [P] Write unit test for StopListItem: renders stop data, address, times

- [ ] T056 [US1] [P] Write unit test for RouteTimeline: displays estimated/actual times, visual indicators

- [ ] T057 [US1] [P] Write integration test for route detail page: fetches route with stops, displays correct data, back link works

### Session Management

- [ ] T058 [US1] [P] Implement session timeout: after 30 min of inactivity, sign out and redirect to login (use Cognito session management)

- [ ] T059 [US1] [P] Create logout functionality: clear session, redirect to login page, show confirmation message

- [ ] T060 [US1] Write integration test for session timeout in `app/customer/__tests__/session.test.tsx`: logout on timeout, manual logout works

---

## User Story 2: Invoice Viewing & Download (P1) - Weeks 4-5

**Story Goal**: Customers can view and download invoices as PDFs  
**Independent Test**: Generate invoice, verify visible/downloadable by customer  
**Success Criteria**: SC-004 (PDF download < 30 sec), SC-011 (only customer can access)

### Invoice List & Filtering

- [ ] T061 [US2] Create GraphQL query `queries/ListMyInvoices.ts` to fetch customer's invoices with date filtering

- [ ] T062 [US2] Create `app/customer/invoices/page.tsx` (invoice list) showing: invoice number, date, period, amount, status, download button

- [ ] T063 [US2] Create `app/customer/components/InvoiceListItem.tsx` for individual invoice display (reusable)

- [ ] T064 [US2] Implement date range filter for invoices (start date, end date) with calendar picker or text inputs

- [ ] T065 [US2] [P] Write unit test for InvoiceListItem: renders invoice data, status badge, download button

- [ ] T066 [US2] [P] Write integration test for invoice list: fetches invoices, filters by date range, displays results

### Invoice Detail & PDF Download

- [ ] T067 [US2] Create GraphQL query `queries/GetInvoiceDetail.ts` to fetch invoice with line items (from plan.md)

- [ ] T068 [US2] Create `app/customer/invoices/[id]/page.tsx` (invoice detail) showing: number, period, line items table, total amount, PDF download button

- [ ] T069 [US2] Create `app/customer/components/InvoiceLineItems.tsx` for displaying itemized charges table (description, quantity, rate, amount)

- [ ] T070 [US2] Implement PDF download: call API endpoint `/api/invoices/[id]/download` which returns signed S3 URL

- [ ] T071 [US2] [P] Write unit test for InvoiceLineItems: renders table with correct data

- [ ] T072 [US2] [P] Write integration test for invoice detail page: fetches invoice, displays line items, PDF download initiates

- [ ] T073 [US2] Test PDF download performance: verify download initiates within 2 seconds (SC-004 requirement)

### File Access Control (Security - US7)

- [ ] T074 [US2] Create API route `/api/invoices/[id]/download` that: (1) verifies customer is authenticated, (2) checks customer ID matches invoice owner, (3) generates signed S3 URL, (4) logs access to AuditLog

- [ ] T075 [US2] [P] Write unit test for download endpoint: authorized customer succeeds, other customer denied, logs AuditLog entry

- [ ] T076 [US2] [P] Write security test: attempt cross-customer download, verify 403 Forbidden response, verify AuditLog shows denied attempt

---

## User Story 3: Customer Statistics Dashboard (P1) - Weeks 5-6

**Story Goal**: Customers see business metrics (jobs, billing, performance)  
**Independent Test**: Create routes/invoices, verify metrics calculated correctly  
**Success Criteria**: SC-010 (95% accurate), SC-001 (dashboard < 2 sec)

### Statistics Calculation

- [ ] T077 [US3] Create utility functions in `lib/statistics.ts` to calculate: totalJobs, totalBilled, outstandingBalance, averageCostPerStop, averageStopsPerRoute, averageCompletionTime

- [ ] T078 [US3] [P] Write unit tests for each statistic function in `lib/statistics.test.ts` with various scenarios (empty data, single route, multiple routes)

- [ ] T079 [US3] Create GraphQL query `queries/GetCustomerStatistics.ts` with optional date range filter (from plan.md)

- [ ] T080 [US3] [P] Write integration test for statistics query: fetches data, calculates correctly, respects date filter

### Dashboard UI

- [ ] T081 [US3] Create `app/customer/dashboard/page.tsx` (customer dashboard) with summary cards and detailed view

- [ ] T082 [US3] Create `app/customer/components/StatsSummaryCard.tsx` for displaying single metric (title, value, trend arrow if applicable)

- [ ] T083 [US3] Create `app/customer/components/StatsPeriodFilter.tsx` for date range selection with presets (last 30 days, this year, custom)

- [ ] T084 [US3] Create `app/customer/components/StatsDetailChart.tsx` for visualizing trends (consider Chart.js or Recharts)

- [ ] T085 [US3] [P] Write unit test for StatsSummaryCard: renders metric value and title

- [ ] T086 [US3] [P] Write unit test for StatsPeriodFilter: selects date range, triggers refresh

- [ ] T087 [US3] [P] Write integration test for dashboard: loads stats, displays all metrics, period filter works, updates in real-time

- [ ] T088 [US3] Test dashboard performance: load time < 2 seconds with 500 historical routes (SC-006)

---

## User Story 4: Operator Customer Account Management (P2) - Weeks 6-7

**Story Goal**: Operators can create, view, and manage customer accounts  
**Independent Test**: Create customer account, verify it appears in list  
**Success Criteria**: SC-002 (account creation < 5 min)

### Operator Authentication

- [ ] T089 [US4] Verify operator login flow: operators authenticate with email/password, role claim set to "operator" in Cognito token

- [ ] T090 [US4] Create `app/operator/page.tsx` redirect to `/operator/dashboard`

- [ ] T091 [US4] Write integration test for operator login in `app/operator/__tests__/login.test.tsx`: login as operator, redirected to operator dashboard

### Customer List & Management

- [ ] T092 [US4] Create GraphQL query `queries/ListOperatorCustomers.ts` to fetch all customers (operator role only)

- [ ] T093 [US4] Create `app/operator/customers/page.tsx` (customer management list) showing: name, email, status, billingRate, totalRoutes, totalBilled, actions (edit, deactivate)

- [ ] T094 [US4] Create `app/operator/components/CustomerListItem.tsx` for individual customer in list (reusable)

- [ ] T095 [US4] Implement customer filtering/search by name or email in customer list

- [ ] T096 [US4] [P] Write unit test for CustomerListItem: renders customer data, action buttons

- [ ] T097 [US4] [P] Write integration test for customer list page: fetches customers, displays in table, search/filter works

### Create Customer

- [ ] T098 [US4] Create GraphQL mutation `mutations/CreateCustomer.ts` with inputs: name, email, contactPhone, billingRatePerHour (from plan.md)

- [ ] T099 [US4] Create `app/operator/customers/new/page.tsx` (create customer form) with fields: name (required), email (required), phone, hourly rate

- [ ] T100 [US4] Create `app/operator/components/CustomerForm.tsx` (reusable form) for create/edit with validation (email format, rate > 0)

- [ ] T101 [US4] Implement form submission: validate inputs, call CreateCustomer mutation, create Cognito user, show success message, redirect to customer detail

- [ ] T102 [US4] [P] Write unit test for CustomerForm: renders fields, validates inputs, submission works

- [ ] T103 [US4] [P] Write integration test for create customer: fill form, submit, verify customer created, appears in list

- [ ] T104 [US4] Test account creation time: complete form to customer visible < 5 minutes (SC-002)

### Update Customer

- [ ] T105 [US4] Create GraphQL mutation `mutations/UpdateCustomer.ts` for modifying customer details and billing rate

- [ ] T106 [US4] Create `app/operator/customers/[id]/edit/page.tsx` (edit customer form) prefilled with current data

- [ ] T107 [US4] Implement form submission for update: validate, call UpdateCustomer mutation, show success, redirect to customer detail

- [ ] T108 [US4] [P] Write integration test for update customer: load form, modify fields, save, verify updates persisted

### Customer Detail & Status

- [ ] T109 [US4] Create GraphQL query `queries/GetOperatorCustomerDetail.ts` for operator view of customer with summary stats

- [ ] T110 [US4] Create `app/operator/customers/[id]/page.tsx` (customer detail) showing: profile, account stats, billing rate, status, actions (edit, deactivate, view routes, view invoices)

- [ ] T111 [US4] Implement status change: deactivate customer (prevents login, keeps historical data), reactivate if needed

- [ ] T112 [US4] [P] Write integration test for customer detail: displays correct data, edit link works, deactivate works, AuditLog tracks

---

## User Story 5: Operator Route Planning & Storage (P2) - Weeks 7-9

**Story Goal**: Operators can create and manage delivery routes with stops  
**Independent Test**: Create route with stops, verify appears in customer's portal  
**Success Criteria**: SC-003 (route planning < 15 min)

### Route Creation

- [ ] T113 [US5] Create GraphQL mutation `mutations/CreateRoute.ts` with inputs: customerId, estimatedDurationMinutes, notes

- [ ] T114 [US5] Create `app/operator/routes/new/page.tsx` (create route form) with: customer dropdown, estimated time input, notes textarea

- [ ] T115 [US5] Create `app/operator/components/RouteForm.tsx` (reusable) for create/edit with customer selection

- [ ] T116 [US5] Implement route creation: validate inputs, create Route record, initialize empty stops list, redirect to add stops

- [ ] T117 [US5] [P] Write unit test for RouteForm: renders fields, customer dropdown works

- [ ] T118 [US5] [P] Write integration test for create route: select customer, fill form, submit, route created with status='planned'

### Stop Management

- [ ] T119 [US5] Create GraphQL mutations `mutations/CreateStop.ts`, `mutations/UpdateStop.ts`, `mutations/DeleteStop.ts` for stop lifecycle

- [ ] T120 [US5] Create `app/operator/routes/[id]/page.tsx` (route detail) showing: route info, stops list (sortable by sequence), add/edit/delete stop buttons

- [ ] T121 [US5] Create `app/operator/components/StopForm.tsx` for adding/editing stops with fields: address (required), serviceType, sequence, estimatedArrivalTime

- [ ] T122 [US5] Implement stop reordering: drag-and-drop or sequence input to change order, update sequence numbers

- [ ] T123 [US5] [P] Write unit test for StopForm: renders fields, validates address required

- [ ] T124 [US5] [P] Write integration test for add stop: add multiple stops, verify sequence, reorder, verify order persisted

- [ ] T125 [US5] [P] Write integration test for delete stop: remove stop, verify sequences renumbered

### Route Status Management

- [ ] T126 [US5] Implement route status transitions in operator UI: planned → active → completed

- [ ] T127 [US5] Create action in `app/operator/routes/[id]/page.tsx` to "Start Route" (status = active, record actualStartTime)

- [ ] T128 [US5] Create mutation `mutations/StartRoute.ts` that sets status='active' and actualStartTime=now (from plan.md)

- [ ] T129 [US5] Create action to "Complete Route" that prompts for actualEndTime (or uses current time), calculates actualDurationMinutes

- [ ] T130 [US5] Create mutation `mutations/CompleteRoute.ts` that sets status='completed', actualEndTime, and calculates duration (from plan.md)

- [ ] T131 [US5] [P] Write integration test for route lifecycle: create route (status=planned), start route (status=active), complete route (status=completed, duration calculated)

### Customer Portal Integration

- [ ] T132 [US5] Verify created routes appear in customer portal (User Story 1): customer logs in, sees route in list

- [ ] T133 [US5] Verify route detail shows correct stops in customer view

- [ ] T134 [US5] Test route planning time: from new route creation to saving 10-stop route < 15 minutes (SC-003)

---

## User Story 6: Invoice Calculation & Generation (P2) - Weeks 9-11

**Story Goal**: System calculates invoices from completed routes, operator can generate and approve  
**Independent Test**: Complete route, generate invoice, verify calculation correct  
**Success Criteria**: SC-010 (95% accurate)

### Invoice Calculation Logic

- [ ] T135 [US6] Create utility functions in `lib/invoice-calculations.ts` to calculate invoice amount: (actualDurationMinutes / 60) * customer.billingRatePerHour

- [ ] T136 [US6] [P] Write unit tests in `lib/invoice-calculations.test.ts` covering: normal calculation, rounding, edge cases (0 minutes, very small times)

- [ ] T137 [US6] Create Lambda function `amplify/functions/calculateInvoice` (optional) for async invoice calculation if needed

- [ ] T138 [US6] Implement business logic: when invoice generated, query all completed routes in period, calculate line items, sum total

### Invoice Generation UI

- [ ] T139 [US6] Create `app/operator/invoices/page.tsx` (invoice management) showing: pending routes (ready for invoicing), generated invoices (draft/finalized)

- [ ] T140 [US6] Create `app/operator/invoices/new/page.tsx` (generate invoice form) with: customer dropdown, period (date range), preview of routes/charges

- [ ] T141 [US6] Create `app/operator/components/InvoicePreview.tsx` showing calculated line items before finalizing (description, hours, rate, amount, total)

- [ ] T142 [US6] Create mutation `mutations/GenerateInvoice.ts` that creates Invoice record with LineItems for selected routes (from plan.md)

- [ ] T143 [US6] Implement form flow: select customer → select period → preview charges → generate invoice → opens detail for review

- [ ] T144 [US6] [P] Write unit test for InvoicePreview: renders line items, calculates total correctly

- [ ] T145 [US6] [P] Write integration test for invoice generation: select customer/period, preview shows correct charges, generate creates invoice record

### Invoice Review & Adjustment

- [ ] T146 [US6] Create `app/operator/invoices/[id]/page.tsx` (invoice detail) for review/adjustment showing: line items table, total, edit button, finalize button

- [ ] T147 [US6] Implement edit line item: operator can adjust quantity (hours) or rate for individual items (FR-019)

- [ ] T148 [US6] Create mutation `mutations/UpdateLineItem.ts` for modifying line item quantity/rate before finalization

- [ ] T149 [US6] Implement recalculation: when line item edited, automatically recalculate total invoice amount

- [ ] T150 [US6] [P] Write integration test for invoice adjustment: edit line item, verify total recalculated, persisted

### Invoice Finalization

- [ ] T151 [US6] Create "Finalize Invoice" action in invoice detail that: marks status='finalized', sets finalizedAt timestamp, triggers PDF generation

- [ ] T152 [US6] Create mutation `mutations/FinalizeInvoice.ts` that updates invoice status to 'finalized'

- [ ] T153 [US6] Implement notification: when invoice finalized, send notification to customer (they can now see/download in their portal)

- [ ] T154 [US6] [P] Write integration test for finalization: finalize invoice, verify status changed, customer can view

- [ ] T155 [US6] Test invoice accuracy: verify 95% of invoices calculated correctly (SC-010) - create 20 test routes with known times/rates, generate invoice, verify all line items correct

---

## User Story 7: Data Isolation & Security (P1) - Throughout all sprints

**Story Goal**: All customer data isolated, cross-customer access prevented, all access logged  
**Independent Test**: Login as different customers, verify no cross-customer visibility  
**Success Criteria**: SC-005 (100% isolation), SC-013 (all access logged)

### Data Isolation Testing

- [ ] T156 [US7] Create comprehensive security test suite `app/__tests__/security/data-isolation.test.ts`

- [ ] T157 [US7] [P] Write test: Customer A logs in, queries routes, should NOT see Customer B's routes

- [ ] T158 [US7] [P] Write test: Customer A attempts URL manipulation to access `/customer/routes/[customerB_routeId]`, should get 403 Forbidden

- [ ] T159 [US7] [P] Write test: Customer A calls GraphQL query with customerB_customerId filter, query should ignore filter and return only own data

- [ ] T160 [US7] [P] Write test: Customer A attempts to modify Customer B's invoice via GraphQL mutation, should be denied

- [ ] T161 [US7] [P] Write test: Operator views Customer A and Customer B, data is properly separated, no leakage in list/detail views

### File Access Control

- [ ] T162 [US7] Create security test `app/__tests__/security/file-access.test.ts`

- [ ] T163 [US7] [P] Write test: Customer A requests signed S3 URL for their invoice, should succeed

- [ ] T164 [US7] [P] Write test: Customer A attempts signed URL for Customer B's invoice, should get 403 Forbidden

- [ ] T165 [US7] [P] Write test: Customer A attempts to forge signed URL (modify customer ID), S3 rejects invalid signature

- [ ] T166 [US7] Implement file organization: verify invoices stored in `s3://bucket/invoices/{customerId}/` paths (from clarification Q3)

### Audit Logging

- [ ] T167 [US7] Implement audit logging: every protected operation logs to AuditLog entity with: customerId, operatorId, eventType, action, status, timestamp

- [ ] T168 [US7] Log security events: authorized access (allowed), unauthorized attempts (denied), file downloads

- [ ] T169 [US7] Create `app/operator/audit/page.tsx` (admin only) to view AuditLog entries with filters (date, customer, event type, status)

- [ ] T170 [US7] [P] Write integration test for audit logging: perform various actions, verify AuditLog entries created with correct details

- [ ] T171 [US7] [P] Write integration test for audit filtering: filter by date/customer/status, verify results correct

### Authorization Rules Enforcement

- [ ] T172 [US7] [P] Verify GraphQL authorization rules prevent unauthorized access at database level (Amplify enforces via auth directives)

- [ ] T173 [US7] [P] Write test: unauthenticated user cannot query any protected data, request returns "Unauthorized"

- [ ] T174 [US7] [P] Write test: customer role cannot access operator-only queries (e.g., ListOperatorCustomers)

- [ ] T175 [US7] [P] Write test: operator role cannot query customer-specific data (routes) unless for authorized customer

- [ ] T176 [US7] Test comprehensive data isolation: verify SC-005 (100% isolation achieved), run all security tests, verify zero cross-customer leakage

---

## Phase 5: PDF Generation & File Storage (Weeks 10-11)

**Goal**: Generate invoice PDFs, store securely in S3, provide download via signed URLs  
**Owner**: Backend Developer  
**Validation**: PDFs generated correctly, stored securely, only authorized customers can download

### PDF Generation

- [ ] T177 [P] Install PDF generation library: npm install html2pdf.js or pdfkit (per plan.md, research best option)

- [ ] T178 Create Lambda function `amplify/functions/generateInvoicePDF/` that: (1) receives invoiceId, (2) fetches invoice data, (3) renders HTML template, (4) generates PDF, (5) uploads to S3

- [ ] T179 [P] Create HTML template `amplify/functions/generateInvoicePDF/template.html` for invoice PDF layout (invoice number, date, customer, line items, total, company info)

- [ ] T180 [P] Test PDF generation locally: create test invoice, call Lambda, verify PDF generated with correct content

- [ ] T181 Write unit test for PDF generation: test with various invoice sizes (small, large), verify output is valid PDF

### S3 Storage & Signed URLs

- [ ] T182 [P] Create S3 bucket configuration in `amplify/storage/resource.ts` (if not existing) with customer-specific folder structure

- [ ] T183 Create API route `/api/invoices/[id]/download` (from T074) that generates signed S3 URL valid for 24 hours

- [ ] T184 [P] Implement customer ID verification in download endpoint before generating URL (prevent cross-customer access)

- [ ] T185 [P] Test signed URL generation: create invoice, generate URL, verify URL expires after 24 hours

- [ ] T186 [P] Test signed URL security: forge invalid URL, verify S3 rejects with 403 InvalidSignature

### Invoice Status & PDF Trigger

- [ ] T187 Create mutation handler that when invoice status changes to 'finalized': triggers PDF generation Lambda, updates invoice with PDF file path

- [ ] T188 [P] Write integration test: finalize invoice, verify Lambda is called, PDF is generated and stored in S3

- [ ] T189 Test PDF download performance: verify download initiates within 2 seconds, PDF delivery < 5 seconds (SC-004, SC-007)

---

## Phase 6: Performance & Polish (Weeks 11-12)

**Goal**: Optimize performance, conduct testing, prepare for launch  
**Owner**: Full Team  
**Validation**: All success criteria met, all tests passing, production-ready

### Performance Optimization

- [ ] T190 [P] Implement data pagination: routes list, invoices list should show 20 items per page with pagination controls

- [ ] T191 [P] Implement caching: use React Query or SWR to cache API responses, reduce redundant queries

- [ ] T192 [P] Optimize GraphQL queries: use selective field queries (not *), implement batch loading if needed

- [ ] T193 [P] Test performance SC-006: fetch 500 routes, verify display time < 2 seconds

- [ ] T194 [P] Test performance SC-008: simulate 100 concurrent user sessions, verify system remains responsive

- [ ] T195 [P] Implement code splitting: lazy load route-specific components to reduce initial bundle size

### Testing & Validation

- [ ] T196 Run full test suite: `npm run test:ci` should pass with >70% coverage

- [ ] T197 Run type checking: `npm run typecheck` should pass with zero errors

- [ ] T198 Run linting: `npm run lint` should pass with zero warnings

- [ ] T199 Conduct end-to-end testing: manually test all 7 user stories from creation to invoice download

- [ ] T200 Security audit: verify all cross-customer tests passing, audit log complete, file access controlled

- [ ] T201 Performance testing: verify all SC criteria met (SC-001 through SC-014)

### Documentation & Deployment

- [ ] T202 Update README.md with setup instructions, feature overview, and troubleshooting guide

- [ ] T203 Create DEPLOYMENT.md documenting deployment process to Amplify staging/production environments

- [ ] T204 [P] Document API contracts: create API documentation (Postman collection or similar) for all GraphQL operations

- [ ] T205 [P] Document database schema: create ER diagram and schema documentation

- [ ] T206 Conduct user acceptance testing (UAT) with stakeholders: verify all user stories work as expected

- [ ] T207 Prepare release notes: document features, known limitations, migration guide if applicable

### Production Deployment

- [ ] T208 Create production environment in Amplify: configure environment variables, set up monitoring

- [ ] T209 Deploy to production: run full test suite, deploy via CI/CD pipeline, verify all health checks pass

- [ ] T210 Monitor production: watch logs/metrics for errors, performance issues, unexpected behavior

- [ ] T211 Conduct post-launch review: gather feedback, identify improvements for next release

---

## Dependencies & Execution Order

### Parallel Execution by Sprint

**Sprint 1 (Phase 0-1)**: Setup + Data Model
- Setup tasks (T001-T010) → Data model tasks (T011-T027) can run in parallel

**Sprint 2 (Phase 2 + US1)**: Frontend Foundation + Customer Portal
- Frontend foundation (T029-T044) → US1 tasks (T045-T060) build on foundation

**Sprint 3 (US2 + US3)**: Invoices + Dashboard
- US2 (T061-T076) and US3 (T077-T088) can run in parallel (separate components)

**Sprint 4 (US4 + US5)**: Operator Portal + Route Planning
- US4 (T089-T112) → US5 (T113-T134) builds on operator portal setup

**Sprint 5 (US6 + US7)**: Billing + Security
- US6 (T135-T175) → US7 security tests (T156-T176) validate against all features

**Sprint 6 (Phase 5-6)**: PDF + Performance + Launch
- Phase 5 PDF (T177-T189) → Phase 6 testing/deployment (T190-T211)

### Critical Path

```
T001-T010 (Setup)
    ↓
T011-T027 (Data Model) + T029-T044 (Frontend Foundation)
    ↓
T045-T060 (US1: Routes) + T061-T076 (US2: Invoices) + T077-T088 (US3: Dashboard)
    ↓
T089-T112 (US4: Operator Customers) → T113-T134 (US5: Route Planning)
    ↓
T135-T175 (US6: Billing + US7: Security)
    ↓
T177-T189 (PDF Generation) → T190-T211 (Performance + Launch)
```

---

## Success Metrics

| Phase | Success Criteria | Verification |
|-------|------------------|--------------|
| Setup (T001-T010) | npm run typecheck && lint && build pass | CI/CD green |
| Data Model (T011-T027) | Schema compiles, GraphQL accessible | ampx sandbox successful |
| Frontend Foundation (T029-T044) | Components render, no errors | Tests pass |
| **US1** (T045-T060) | Customer can login, view routes | Manual + automated tests |
| **US2** (T061-T076) | Customer can view/download invoices | SC-004 validation |
| **US3** (T077-T088) | Dashboard shows correct metrics | SC-006, SC-009 validation |
| **US4** (T089-T112) | Operator creates customers | SC-002 validation |
| **US5** (T113-T134) | Operator plans routes with stops | SC-003 validation |
| **US6** (T135-T175) | Invoices calculated correctly | SC-010 validation (95% accuracy) |
| **US7** (T156-T176) | Zero cross-customer access | SC-005 validation (100% isolation) |
| **PDF** (T177-T189) | PDFs generated/stored/downloadable | SC-004, SC-007 validation |
| **Performance** (T190-T195) | All performance criteria met | SC-001, SC-006, SC-008 validation |
| **Launch** (T196-T211) | Production deployment successful | Live system verified |

---

## Task Count Summary

| Phase | Task Count | User Stories |
|-------|-----------|--------------|
| Phase 0: Setup | 10 | - |
| Phase 1: Data Model | 17 | - |
| Phase 2: Frontend Foundation | 16 | - |
| **US1**: Customer Routes | 21 | P1 |
| **US2**: Invoices | 16 | P1 |
| **US3**: Dashboard | 12 | P1 |
| **US4**: Operator Accounts | 24 | P2 |
| **US5**: Route Planning | 23 | P2 |
| **US6**: Invoice Generation | 21 | P2 |
| **US7**: Data Isolation | 21 | P1 (Security) |
| Phase 5: PDF Storage | 13 | - |
| Phase 6: Performance | 22 | - |
| **TOTAL** | **211 Tasks** | **7 User Stories** |

---

**Status**: ✅ Ready for Sprint 1  
**Start Date**: 2025-12-20  
**Expected Completion**: 12 weeks  
**Team Size**: 2-3 developers recommended

Begin with Phase 0 setup tasks (T001-T010), then proceed to Phase 1 (T011-T027).
