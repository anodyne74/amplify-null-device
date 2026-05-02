import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * Delivery Management System Data Model
 * 
 * Schema includes 8 entities for a complete delivery management platform:
 * - Customer: Business customers using the service
 * - Operator: Staff members managing routes and billing
 * - Route: Delivery routes assigned to customers
 * - Stop: Individual stops within a route
 * - Invoice: Billing documents for customers
 * - LineItem: Charges on invoices
 * - PaymentRecord: Payment history tracking
 * - AuditLog: Security audit trail for compliance
 * 
 * Authorization Rules:
 * - Customers can only access their own data (routes, invoices, payments)
 * - Operators can manage all resources
 * - All access attempts are logged for audit trail
 */

const schema = a.schema({
  /**
   * Customer - Represents a business customer using the delivery service
   * Authorization: Owner (customer) can read/update own profile; Operators have full access
   */
  Customer: a
    .model({
      name: a.string().required(),
      email: a.email().required(),
      contactPhone: a.phone(),
      status: a.enum(['active', 'inactive', 'suspended']),
      billingRatePerHour: a.float().required(), // Configurable hourly rate for invoicing
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      routes: a.hasMany('Route', 'customerId'),
      stops: a.hasMany('Stop', 'customerId'),
      invoices: a.hasMany('Invoice', 'customerId'),
      lineItems: a.hasMany('LineItem', 'customerId'),
      payments: a.hasMany('PaymentRecord', 'customerId'),
      auditLogs: a.hasMany('AuditLog', 'customerId'),
    })
    .authorization((allow) => [
      allow.owner().identityClaim('sub').to(['create', 'read', 'update']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * Operator - Represents a staff member managing customers and routes
   * Authorization: Operators can read their own profile; Admins manage all operators
   */
  Operator: a
    .model({
      name: a.string().required(),
      email: a.email().required(),
      role: a.enum(['admin', 'manager', 'staff']),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner().identityClaim('sub').to(['read']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * Route - Represents a delivery route assigned to a customer
   * Time tracking: estimatedDurationMinutes (entered by operator) vs actualDurationMinutes (recorded at completion)
   */
  Route: a
    .model({
      customerId: a.id().required(), // Foreign key to Customer
      status: a.enum(['planned', 'active', 'completed', 'archived']),
      estimatedDurationMinutes: a.integer(),
      actualStartTime: a.datetime(),
      actualEndTime: a.datetime(),
      actualDurationMinutes: a.integer(),
      notes: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
      stops: a.hasMany('Stop', 'routeId'),
      lineItems: a.hasMany('LineItem', 'routeId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('customerId').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read', 'update']),
    ]),

  /**
   * Stop - Individual stop within a route (e.g., delivery address)
   * Stops are ordered by sequence number for route planning
   */
  Stop: a
    .model({
      routeId: a.id().required(), // Foreign key to Route
      customerId: a.id(), // Denormalized customer owner for tenant-safe read access
      sequence: a.integer().required(), // Order of stops in route
      address: a.string().required(),
      serviceType: a.enum(['delivery', 'pickup', 'inspection']),
      estimatedArrivalTime: a.datetime(),
      actualArrivalTime: a.datetime(),
      actualDepartureTime: a.datetime(),
      numberOfSigns: a.integer(),
      agent: a.string(),
      isAuction: a.boolean(),
      latitude: a.float(),
      longitude: a.float(),
      formattedAddress: a.string(),
      notes: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      route: a.belongsTo('Route', 'routeId'),
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('customerId').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read', 'update']),
    ]),

  /**
   * Invoice - Billing document for a customer
   * Status lifecycle: draft → finalized → sent → paid
   * Invoices reference routes/stops for line item generation
   */
  Invoice: a
    .model({
      customerId: a.id().required(), // Foreign key to Customer
      invoiceNumber: a.string().required(),
      invoiceDate: a.date().required(),
      periodStartDate: a.date(),
      periodEndDate: a.date(),
      totalAmount: a.float().required(),
      status: a.enum(['draft', 'finalized', 'sent', 'paid']),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
      lineItems: a.hasMany('LineItem', 'invoiceId'),
      payment: a.hasOne('PaymentRecord', 'invoiceId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('customerId').identityClaim('sub').to(['read']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * LineItem - Individual charge on an invoice
   * References a specific route and its associated stop
   * Amount = quantity × ratePerUnit
   */
  LineItem: a
    .model({
      invoiceId: a.id().required(), // Foreign key to Invoice
      customerId: a.id(), // Denormalized customer owner for tenant-safe read access
      routeId: a.id(), // Optional reference to Route for tracking
      description: a.string().required(),
      quantity: a.float(),
      ratePerUnit: a.float().required(),
      amount: a.float().required(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      invoice: a.belongsTo('Invoice', 'invoiceId'),
      route: a.belongsTo('Route', 'routeId'),
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('customerId').identityClaim('sub').to(['read']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * PaymentRecord - Tracks payment history for invoices
   * Used for reconciliation and payment status tracking
   */
  PaymentRecord: a
    .model({
      customerId: a.id().required(), // Foreign key to Customer
      invoiceId: a.id(), // Optional reference to specific invoice
      paymentDate: a.date().required(),
      amount: a.float().required(),
      paymentMethod: a.enum(['credit_card', 'bank_transfer', 'check', 'other']),
      referenceNumber: a.string(),
      status: a.enum(['pending', 'completed', 'failed', 'refunded']),
      notes: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
      invoice: a.belongsTo('Invoice', 'invoiceId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('customerId').identityClaim('sub').to(['read']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * AuditLog - Security audit trail for compliance
   * Logs all data access attempts (successful and failed)
   * Used to verify data isolation and detect unauthorized access
   * FR-016: System MUST log all attempts to access data outside of authorized scope
   */
  AuditLog: a
    .model({
      customerId: a.id(), // Optional: associated customer
      operatorId: a.id(), // Optional: user who performed action
      eventType: a.enum(['login', 'logout', 'access_denied', 'data_access', 'data_modification', 'data_deletion']),
      resourceType: a.enum(['customer', 'route', 'invoice', 'payment', 'operator']),
      resourceId: a.id(),
      action: a.string().required(),
      status: a.enum(['success', 'failure']),
      reason: a.string(), // Why access was denied (if applicable)
      ipAddress: a.string(),
      userAgent: a.string(),
      timestamp: a.datetime().required(),
      createdAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.groups(['operator']).to(['read', 'create']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
