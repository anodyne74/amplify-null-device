# Data Model: Delivery Management System

**Purpose**: Complete entity schema for Amplify Data (GraphQL)  
**Location**: `amplify/data/resource.ts`  
**Created**: 2025-12-20

## Entity Relationship Diagram

```
┌──────────────┐         ┌─────────┐
│  Customer    │────┬────│ Route   │
└──────────────┘    │    └─────────┘
       │            │         │
       │            ├────┐    └──────────┬──────────────┐
       │            │    │              │              │
       ├────────┬───┤    │              │              │
       │        │   │    │          ┌────────┐         │
       │        │   │    │          │ Stop   │         │
       │        │   │    │          └────────┘         │
       │        │   │    │              │              │
   ┌─────────┐ │   │    │          (stops ordered      │
   │Invoice  │─┘   │    │           by sequence)      │
   └─────────┘     │    │              │              │
       │           │    │              ▼              │
       ├─────────┐ │    │         ┌─────────────┐    │
       │         │ │    │         │ LineItem    │────┘
   ┌────────┐    │ │    │         └─────────────┘
   │LineItem│────┘ │    │              │
   └────────┘      │    │              ▼
       │           │    │         (references
       │      ┌──────────┤          Route)
       │      │    │    │
       ▼      ▼    │    │
   ┌────────────────────────┐
   │ PaymentRecord          │
   └────────────────────────┘
        (tracks payments)

   ┌──────────────────────┐
   │ AuditLog             │ (Every access logged)
   └──────────────────────┘
        (for FR-016)

   ┌──────────────────────┐
   │ Operator             │ (Staff managing system)
   └──────────────────────┘
        (role-based access)
```

## Entity Definitions

### 1. Customer

Represents a business customer using the delivery management system.

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `name` | String | ✅ | Business name |
| `email` | Email | ✅ | Cognito login credential |
| `contactPhone` | Phone | ❌ | Optional contact |
| `status` | Enum: active\|inactive\|suspended | ✅ | Account lifecycle |
| `billingRatePerHour` | Float | ✅ | Hourly charge rate (clarification) |
| `createdAt` | DateTime | ✅ | Account creation |
| `updatedAt` | DateTime | ❌ | Last modification |

**Authorization**:
- **Owner (Customer)**: `read`, `update` (can view own profile, update contact)
- **Operator (Staff)**: `create`, `read`, `update` (full management)
- **Public**: No access

**Relationships**:
- `routes`: hasMany(Route) - All routes for this customer
- `invoices`: hasMany(Invoice) - All invoices
- `payments`: hasMany(PaymentRecord) - Payment history

**Notes**:
- Email address must be unique and linked to Cognito user pool
- Rate changes apply to future invoices only (clarification Q1)
- Status changes prevent login (if inactive/suspended)

---

### 2. Operator

Represents a staff member (internal to business) managing customers and routes.

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `name` | String | ✅ | Staff member name |
| `email` | Email | ✅ | Staff login (operator pool) |
| `role` | Enum: admin\|manager\|staff | ✅ | Permission level |
| `createdAt` | DateTime | ✅ | Account creation |

**Authorization**:
- **Operators**: `read` (can view other operators)
- **Admin**: `create`, `read`, `update`, `delete` (manage operators)
- **Customer**: No access

**Relationships**:
- AuditLog entries created by this operator

**Notes**:
- Separate from Customer—internal staff only
- Role determines what operations are allowed
- `admin`: Can manage operators, deactivate customers, view audit logs
- `manager`: Can manage customer accounts, generate reports
- `staff`: Can create/edit routes, mark routes complete

---

### 3. Route

Represents a delivery route assigned to a customer (one or more stops).

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `customerId` | ID | ✅ | Foreign key to Customer |
| `customer` | Customer | ✅ | Navigation property |
| `status` | Enum: planned\|active\|completed\|cancelled | ✅ | Route lifecycle |
| `estimatedDurationMinutes` | Int | ❌ | Operator estimate during planning (clarification Q2) |
| `actualStartTime` | DateTime | ❌ | When route actually began |
| `actualEndTime` | DateTime | ❌ | When route actually finished |
| `actualDurationMinutes` | Int | ❌ | Computed: (endTime - startTime) / 60 |
| `notes` | String | ❌ | Operator notes |
| `createdAt` | DateTime | ✅ | Creation time |
| `updatedAt` | DateTime | ❌ | Last modification |

**Authorization**:
- **Customer (Owner)**: `read` (view own routes)
- **Operator**: `create`, `read`, `update` (manage routes for any customer)
- **Public**: No access

**Relationships**:
- `customer`: belongsTo(Customer) - The customer this route serves
- `stops`: hasMany(Stop) - Individual stops in order
- `invoiceLineItems`: hasMany(LineItem) - Billing items derived from route

**Status Transitions**:
```
planned → active → completed
   ↘________↙
    cancelled
```

**Notes**:
- `estimatedDurationMinutes`: Set during planning (operator guess)
- Time tracking: Actual times recorded when route marked complete (clarification Q2)
- Customer sees routes but cannot modify (read-only)
- Duration calculated automatically from start/end times

---

### 4. Stop

Represents an individual stop within a route (pickup, delivery, inspection, etc.).

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `routeId` | ID | ✅ | Foreign key to Route |
| `route` | Route | ✅ | Navigation property |
| `sequence` | Int | ✅ | Order in route (1, 2, 3...) |
| `address` | String | ✅ | Delivery/pickup address |
| `serviceType` | Enum: pickup\|delivery\|inspection | ✅ | Type of service |
| `estimatedArrivalTime` | DateTime | ❌ | Operator estimate |
| `actualArrivalTime` | DateTime | ❌ | When vehicle actually arrived |
| `actualDepartureTime` | DateTime | ❌ | When vehicle actually left |
| `notes` | String | ❌ | Operator notes (access code, contact, etc.) |
| `createdAt` | DateTime | ✅ | Creation time |
| `updatedAt` | DateTime | ❌ | Last modification |

**Authorization**:
- **Customer (Owner)**: `read` (view own stops)
- **Operator**: `create`, `read`, `update` (manage)
- **Public**: No access

**Relationships**:
- `route`: belongsTo(Route) - Parent route

**Notes**:
- Sequence determines order; stops should be queried sorted by sequence
- Times capture actual performance for analytics
- Stop duration = actualDepartureTime - actualArrivalTime (for analytics)

---

### 5. Invoice

Represents a billing document issued to a customer for completed routes.

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `customerId` | ID | ✅ | Foreign key to Customer |
| `customer` | Customer | ✅ | Navigation property |
| `invoiceNumber` | String | ✅ | Human-readable number (e.g., "INV-2025-001") |
| `invoiceDate` | Date | ✅ | Date invoice was issued |
| `periodStartDate` | Date | ✅ | Billing period start |
| `periodEndDate` | Date | ✅ | Billing period end |
| `totalAmount` | Float | ✅ | Sum of line items (calculated) |
| `status` | Enum: draft\|finalized\|sent\|paid\|cancelled | ✅ | Invoice lifecycle |
| `createdAt` | DateTime | ✅ | Creation time |
| `updatedAt` | DateTime | ❌ | Last modification |
| `finalizedAt` | DateTime | ❌ | When approved for customer |

**Authorization**:
- **Customer (Owner)**: `read` (view own invoices)
- **Operator**: `create`, `read`, `update` (generate/manage)
- **Public**: No access

**Relationships**:
- `customer`: belongsTo(Customer)
- `lineItems`: hasMany(LineItem) - Individual charges
- `payments`: hasMany(PaymentRecord) - Payment history

**Status Lifecycle**:
```
draft → finalized → sent → paid
  ↘____________↙
    cancelled
```

**Notes**:
- Operator creates invoice in `draft` status
- Can adjust line items before finalizing (FR-019)
- Only finalized invoices visible to customer
- PDF generated when status = "sent" (stored in S3)

---

### 6. LineItem

Represents an individual charge on an invoice.

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `invoiceId` | ID | ✅ | Foreign key to Invoice |
| `invoice` | Invoice | ✅ | Navigation property |
| `routeId` | ID | ❌ | Reference to source Route (optional) |
| `route` | Route | ❌ | Navigation property (optional) |
| `description` | String | ✅ | Human-readable (e.g., "Route delivery - 3.5 hours") |
| `quantity` | Float | ✅ | Hours worked (can be fractional) |
| `ratePerUnit` | Float | ✅ | Dollar per hour (customer rate at time of invoice) |
| `amount` | Float | ✅ | Calculated: quantity * ratePerUnit |
| `createdAt` | DateTime | ✅ | Creation time |

**Authorization**:
- **Customer (Owner)**: `read` (view on invoice)
- **Operator**: `create`, `read`, `update` (manage before finalization)
- **Public**: No access

**Relationships**:
- `invoice`: belongsTo(Invoice)
- `route`: belongsTo(Route) - Optional reference

**Notes**:
- One line item per route typically
- Quantity = actualDurationMinutes / 60
- RatePerUnit = customer.billingRatePerHour at time of invoice generation
- Amount auto-calculated for consistency
- Operator can adjust quantity/rate before finalizing (FR-019)

---

### 7. PaymentRecord

Represents a payment received from a customer against an invoice.

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `customerId` | ID | ✅ | Foreign key to Customer |
| `customer` | Customer | ✅ | Navigation property |
| `invoiceId` | ID | ❌ | Foreign key to Invoice (optional) |
| `invoice` | Invoice | ❌ | Navigation property (optional) |
| `paymentDate` | Date | ✅ | When payment was received |
| `amount` | Float | ✅ | Amount paid |
| `paymentMethod` | Enum: check\|bank_transfer\|credit_card\|other | ✅ | How paid |
| `referenceNumber` | String | ❌ | Check #, transaction ID, etc. |
| `status` | Enum: pending\|completed\|failed | ✅ | Payment status |
| `notes` | String | ❌ | Operator notes |
| `createdAt` | DateTime | ✅ | Record creation time |

**Authorization**:
- **Customer (Owner)**: `read` (view own payments)
- **Operator**: `create`, `read` (record payments)
- **Public**: No access

**Relationships**:
- `customer`: belongsTo(Customer)
- `invoice`: belongsTo(Invoice) - Optional

**Notes**:
- Operator records payments as received
- Multiple payments can apply to same invoice (partial payments)
- Outstanding balance = sum(invoice.totalAmount) - sum(payment.amount)

---

### 8. AuditLog

Captures all security-relevant events for compliance (FR-016, per Constitution).

**Attributes**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | ID | ✅ | Auto-generated |
| `customerId` | ID | ❌ | Customer being accessed (if applicable) |
| `operatorId` | ID | ❌ | Staff member performing action (if applicable) |
| `eventType` | Enum: data_access\|file_access\|unauthorized_attempt | ✅ | Type of event |
| `resourceType` | String | ✅ | 'route', 'invoice', 'file', 'customer', etc. |
| `resourceId` | String | ✅ | ID of resource being accessed |
| `action` | Enum: read\|create\|update\|delete\|download | ✅ | What action attempted |
| `status` | Enum: allowed\|denied | ✅ | Whether authorized |
| `reason` | String | ❌ | Why denied, if applicable |
| `ipAddress` | String | ❌ | Request origin |
| `userAgent` | String | ❌ | Browser/client info |
| `timestamp` | DateTime | ✅ | When event occurred |

**Authorization**:
- **Admin Operator only**: `read` (view audit logs)
- **Others**: No access
- **Automatic logging**: System logs, no manual create

**Notes**:
- Every access attempt logged (FR-016)
- Used for security audit and compliance
- Should be queried with admin credentials only
- Retention policy: Keep for minimum 1 year (business requirement)

---

## Calculated/Derived Fields

Some fields are automatically calculated and stored for performance:

| Field | Calculation | When Updated |
|-------|------------|--------------|
| `Route.actualDurationMinutes` | (actualEndTime - actualStartTime) / 60 | When route completed |
| `Invoice.totalAmount` | SUM(lineItem.amount for all lineItems) | When lineItem created/updated |
| `Customer.outstandingBalance` | SUM(invoice.totalAmount) - SUM(payment.amount) | Calculated on query |

---

## Data Isolation Strategy

**Core Principle**: Customer ID is the isolation boundary.

**Implementation**:

1. **Database Level**:
   - Cognito user → Customer record via email matching
   - All queries filtered by `customerId` matching authenticated customer

2. **GraphQL Authorization Rules**:
   ```
   Customer: allow.owner().to(['read', 'update'])
   Route: allow.owner().to(['read'])
   Invoice: allow.owner().to(['read'])
   ```

3. **API Endpoint Level**:
   - Authenticated user's customerId extracted from Cognito token
   - All queries validated: `WHERE customerId = authenticatedCustomerId`
   - Cross-customer requests rejected with 403 Forbidden

4. **File Storage Level**:
   - Files stored in customer-specific paths: `s3://bucket/invoices/{customerId}/{invoiceId}.pdf`
   - Signed URLs generated only after authorization check
   - Downloads logged to AuditLog

---

## Key Constraints & Rules

| Constraint | Rationale | Enforcement |
|-----------|-----------|------------|
| Invoice can only reference routes with matching customerId | Data isolation | Database relationship |
| LineItem.ratePerUnit must be > 0 | Prevent invalid billing | Schema validation |
| Route.actualStartTime must be ≤ actualEndTime | Logical consistency | Schema validation |
| Stop.sequence must be unique within route | Route ordering | Database unique constraint |
| Payment.amount must be > 0 | Prevent negative payments | Schema validation |
| Customer.status = inactive → login prevented | Account lifecycle | Auth layer |

---

## Amplify Schema Best Practices Applied

✅ **Type Safety**: All fields strongly typed  
✅ **Relationships**: hasMany/belongsTo for automatic resolution  
✅ **Authorization**: Built-in auth rules with Cognito integration  
✅ **Indexing**: Natural indexes on foreign keys and frequently-queried fields  
✅ **Audit Trail**: AuditLog entity for compliance  
✅ **Soft Deletes**: Use status enum instead of hard deletes (preserves data)  
✅ **Timestamps**: createdAt/updatedAt on all transactional entities  
✅ **Isolation**: Customer ID as boundary at all levels  

---

**Next Step**: Implement schema in `amplify/data/resource.ts` during Sprint 1
