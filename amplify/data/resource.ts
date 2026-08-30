import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { customerAccessActivation } from '../functions/customer-access-activation/resource';

/**
 * Delivery Management System Data Model
 *
 * Schema includes entities for a complete delivery management platform:
 * - Customer: Business customers using the service
 * - Operator: Staff members managing routes and billing
 * - Route: Delivery routes assigned to customers
 * - Stop: Individual stops within a route
 * - Invoice: Billing documents for customers
 * - LineItem: Charges on invoices
 * - PaymentRecord: Payment history tracking
 * - AuditLog: Security audit trail for compliance
 * - CustomerUser: Cognito users associated with a customer (account_owner or read_only)
 * - Administrator: Administrator profile details synced from Cognito
 * - UserSettings: Per-user UI preferences
 * - OrganizationSettings: Null Device's own invoice remittance details (single row)
 * - OperatorAvailabilityBlock: Days Null Device has no drivers available for a customer
 * - CustomerClosureBlock: Days a customer's agency is closed
 * - RateLine: Named, priced lines on a customer's rate card
 * - OperatorPayout: Driver-split payouts owed to operators for a customer's billing period
 * - VanSignCount: An operator's daily count of signs on their van
 *
 * Authorization Rules:
 * - Customers can only access their own data (routes, invoices, payments)
 * - Operators can manage all resources
 * - All access attempts are logged for audit trail
 */

const schema = a.schema({
  /**
   * Customer - Represents a business customer using the delivery service
   * Authorization: account_owner CustomerUser (via accountOwnerSub) can read/update their own
   * profile; every CustomerUser (via viewerSubs) can read it; Operators/Administrators have full access.
   */
  Customer: a
    .model({
      name: a.string().required(),
      companyName: a.string(),
      email: a.email().required(),
      contactPhone: a.phone(),
      // Address (single formatted value, same style as stop.formattedAddress)
      addressLine1: a.string(),
      standingInstructions: a.string(),
      // Attribution for the standing instructions field — stamped whenever it changes.
      standingInstructionsUpdatedBy: a.string(),
      standingInstructionsUpdatedAt: a.datetime(),
      defaultNumberOfSigns: a.integer(),
      defaultAgentName: a.string(),
      defaultAgentInitials: a.string(),
      agentOptions: a.string().array(),
      status: a.enum(['active', 'inactive', 'suspended']),
      billingRatePerHour: a.float().required(), // Configurable hourly rate for invoicing
      // Rate card / GST / direct-debit — customer-scoped billing setup (distinct from
      // OrganizationSettings, which is Null Device's own remittance details)
      gstRegistered: a.boolean(),
      gstAbn: a.string(), // Customer's own ABN
      directDebitAccountName: a.string(),
      directDebitBsb: a.string(),
      directDebitAccountNumber: a.string(),
      directDebitAuthorizedAt: a.datetime(),
      // Billing cycle & tax — administrator-configured
      billingCycle: a.enum(['weekly', 'fortnightly', 'monthly']),
      paymentTermsDays: a.integer(),
      groupLineItemsByAgent: a.boolean(),
      autoSendInvoiceOnPeriodClose: a.boolean(),
      gstExclusive: a.boolean(), // Rates are ex GST — 10% is added at invoice time (see Invoice.gstAmount)
      // Standing orders — the customer's own default placement preferences (account_owner-editable)
      standingPickupDay: a.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
      notifyOnLowSigns: a.boolean(),
      sendMissingSignsReport: a.boolean(),
      // Billing details — self-service, account_owner-editable
      billingCcEmails: a.string().array(),
      attachAgentBreakdown: a.boolean(),
      sendPaymentReminder: a.boolean(),
      // Driver split — the share of this customer's billed amount paid out to the
      // operator assigned on each route (Route.assignedOperatorSub). Computed and
      // tracked via the OperatorPayout model.
      driverSplitPercent: a.float(),
      driverSplitBasis: a.enum(['percentage_of_line_rate']),
      hideDriverSplitFromCustomer: a.boolean(),
      paySplitOnCompletedStopsOnly: a.boolean(),
      // Administrator-configured: when true, gates a customer-side "invite a
      // teammate" feature (not yet built) so the account owner can only invite
      // email addresses on this Customer's own registered email domain
      // (derived from `email` above, not a separately stored value).
      restrictInvitesToOwnDomain: a.boolean(),
      // Owner/viewer subs — same pattern as Route/Stop, synced by the customer-access-activation
      // Lambda. accountOwnerSub grants the account owner read/write to their own Customer record;
      // viewerSubs grants every customer user (owner + read_only) read access.
      accountOwnerSub: a.string(),
      viewerSubs: a.string().array(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      routes: a.hasMany('Route', 'customerId'),
      stops: a.hasMany('Stop', 'customerId'),
      invoices: a.hasMany('Invoice', 'customerId'),
      lineItems: a.hasMany('LineItem', 'customerId'),
      payments: a.hasMany('PaymentRecord', 'customerId'),
      auditLogs: a.hasMany('AuditLog', 'customerId'),
      users: a.hasMany('CustomerUser', 'customerId'),
      operatorAvailabilityBlocks: a.hasMany('OperatorAvailabilityBlock', 'customerId'),
      customerClosureBlocks: a.hasMany('CustomerClosureBlock', 'customerId'),
      rateLines: a.hasMany('RateLine', 'customerId'),
      payouts: a.hasMany('OperatorPayout', 'customerId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('accountOwnerSub').identityClaim('sub').to(['read', 'update']),
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * Operator - Represents a staff member managing customers and routes. Also the
   * driver roster (Driver and Operator are the same person/record — see the
   * Drivers screen at app/administrator/drivers/page.tsx): `id` is set to the
   * operator's genuine Cognito sub by syncOperatorRecords() in
   * app/api/admin/users/route.ts (same pattern as Administrator's own sync),
   * so this is the queryable directory that Route.assignedOperatorSub and
   * OperatorPayout.operatorSub previously had no counterpart for.
   * Authorization: Operators can read their own profile; Admins manage all operators
   */
  Operator: a
    .model({
      name: a.string().required(),
      email: a.email().required(),
      role: a.enum(['admin', 'manager', 'staff']),
      // Plain string, not a.phone() (AWSPhone) -- that scalar's NANP-style grouping
      // rejects ordinary AU mobile formats (e.g. "0412 345 678"), which broke every
      // save on the Drivers screen's free-text Mobile field.
      phone: a.string(),
      vehicleAndRego: a.string(),
      homeBase: a.string(),
      status: a.enum(['active', 'onboarding', 'inactive']),
      // Pay split — editable on the Drivers screen. NOTE: not yet read by
      // lib/driverSplit.ts's computeDriverSplit() or
      // app/administrator/invoices/driverSplitPreview.ts, both of which still
      // use only Customer.driverSplitPercent. Wiring a per-driver override into
      // payout/invoice computation is a separate, not-yet-requested change.
      driverSplitPercent: a.float(),
      payCycle: a.enum(['weekly', 'fortnightly', 'monthly']),
      paySplitOnCompletedStopsOnly: a.boolean(),
      // Customers rostered to this driver first (admin-managed list — not derived
      // from Route.assignedOperatorSub).
      assignedCustomerIds: a.string().array(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner().identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * Route - Represents a delivery route assigned to a customer
   * Time tracking: estimatedDurationMinutes (entered by operator) vs actualDurationMinutes (recorded at completion)
   */
  Route: a
    .model({
      routeCode: a.string(), // Human-readable route identifier (e.g. W19-26-001)
      customerId: a.id().required(), // Foreign key to Customer
      viewerSubs: a.string().array(), // Cognito subs of all customer users — grants read access
      status: a.enum(['planned', 'in_progress', 'signs_placed', 'signs_picked_up', 'completed', 'archived']),
      // 'load' and 'unload' are only used by the drivingModeEnabled sign-run flow
      // (see below) — the existing 2-phase execution mode never sets them.
      executionPhase: a.enum(['load', 'placement', 'pickup', 'unload']),
      // The day this route is planned to run. Checked client-side against
      // OperatorAvailabilityBlock/CustomerClosureBlock at creation (RouteForm,
      // app/administrator/routes/new) so a route is never built on a day either
      // side has blocked. Optional so historical routes (created before this
      // field existed) remain valid.
      scheduledDate: a.date(),
      estimatedDurationMinutes: a.integer(),
      actualStartTime: a.datetime(),
      actualEndTime: a.datetime(),
      placementStartTime: a.datetime(),
      placementEndTime: a.datetime(),
      pickupStartTime: a.datetime(),
      pickupEndTime: a.datetime(),
      actualDurationMinutes: a.integer(),
      signsPlacedDistanceKm: a.float(),
      signsPickedUpDistanceKm: a.float(),
      overrideSigns: a.integer(),
      overrideStops: a.integer(),
      overrideDistanceKm: a.float(),
      overrideDurationMinutes: a.integer(),
      overrideRate: a.float(),
      overrideAmount: a.float(),
      notes: a.string(),
      customerInstructions: a.string(), // Customer-authored, distinct from the operator's own `notes`
      customerFeedbackTone: a.enum(['good', 'issue']), // Customer-authored, asked once the route is completed
      customerFeedbackNote: a.string(),
      drivingModeEnabled: a.boolean(), // Renders the operator app's simplified in-vehicle driving mode for this route
      // Sign-run flow (drivingModeEnabled routes only) — the Load/Unload confirmations
      // and the four Finalise-screen adjuster rows. Finalise sums the billed*Minutes
      // fields into overrideDurationMinutes, and its distance adjuster writes
      // overrideDistanceKm above, so invoicing/payouts read those existing fields
      // unchanged and need no awareness of the sign-run flow.
      loadConfirmedAt: a.datetime(),
      loadedSignsCount: a.integer(), // Confirmed at Load — may differ from the sum of Stop.numberOfSigns after a recount
      unloadConfirmedAt: a.datetime(),
      billedLoadMinutes: a.integer(),
      billedPlacementMinutes: a.integer(),
      billedPickupMinutes: a.integer(),
      billedUnloadMinutes: a.integer(),
      vanCount: a.integer(), // Number of vans/vehicles assigned to this route
      scheduleS3Key: a.string(), // S3 key for the uploaded schedule file
      // Operator assignment — display/notification tag only, not an authorization scope.
      // Denormalized (no FK) since the Operator model is never populated; operators are
      // managed as Cognito group membership only. Every operator group member keeps full
      // Route access regardless of assignment, per the existing authorization rules below.
      assignedOperatorSub: a.string(), // Cognito sub of the assigned operator
      assignedOperatorName: a.string(),
      assignedOperatorEmail: a.string(),
      assignedAt: a.datetime(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
      stops: a.hasMany('Stop', 'routeId'),
      lineItems: a.hasMany('LineItem', 'routeId'),
      invoices: a.hasMany('Invoice', 'routeId'),
      payouts: a.hasMany('OperatorPayout', 'routeId'),
    })
    .authorization((allow) => [
      // 'update' scoped in practice to customerInstructions by the client (lib/queries.ts
      // updateRouteCustomerInstructions) — Amplify Gen 2 has no field-level authorization,
      // so this is a coarse grant like the rest of this schema. Covers both account_owner
      // and read_only CustomerUser sub-roles (not distinguishable at this layer).
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read', 'update']),
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
      viewerSubs: a.string().array(), // Cognito subs of all customer users — grants read access
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
      // Sign-run flow (drivingModeEnabled routes only) — one tap logs one missing sign
      // during the pickup phase; missing signs never count as collected. The last-logged
      // fields back the pickup screen's coordinate/time stamp and its Undo affordance;
      // undo-after-undo does not restore an earlier stamp exactly.
      missingSignsCount: a.integer(),
      missingSignsLastLoggedAt: a.datetime(),
      missingSignsLastLatitude: a.float(),
      missingSignsLastLongitude: a.float(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      route: a.belongsTo('Route', 'routeId'),
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read', 'update']),
    ]),

  /**
   * Invoice - Billing document for a customer
   * Status lifecycle: draft → sent → paid
   * Invoices reference routes/stops for line item generation
   */
  Invoice: a
    .model({
      customerId: a.id().required(),
      invoiceNumber: a.string().required(),
      invoiceDate: a.date().required(),
      periodStartDate: a.date(),
      periodEndDate: a.date(),
      totalAmount: a.float().required(),
      gstAmount: a.float(), // GST applied at issue time (Customer.gstExclusive) — stored so historical invoices stay accurate if the toggle changes later
      status: a.enum(['draft', 'sent', 'paid']),
      importedAt: a.datetime(),
      routeId: a.id(),        // linked route
      pdfS3Key: a.string(),   // S3 key for uploaded PDF e.g. invoices/{id}.pdf
      emailSentAt: a.datetime(), // timestamp of last SES email send
      // Cognito subs of all customer users — grants read access. customerId itself
      // can't be used with ownerDefinedIn since it's a foreign key, not a Cognito sub.
      viewerSubs: a.string().array(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      customer: a.belongsTo('Customer', 'customerId'),
      route: a.belongsTo('Route', 'routeId'),
      lineItems: a.hasMany('LineItem', 'invoiceId'),
      payment: a.hasOne('PaymentRecord', 'invoiceId'),
    })
    .authorization((allow) => [
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
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
      // Cognito subs of all customer users — grants read access. customerId itself
      // can't be used with ownerDefinedIn since it's a foreign key, not a Cognito sub.
      viewerSubs: a.string().array(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      invoice: a.belongsTo('Invoice', 'invoiceId'),
      route: a.belongsTo('Route', 'routeId'),
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * RateLine - A named, priced line on a customer's rate card (e.g. "Placement",
   * "After-hours surcharge"). Internal pricing config, not customer-facing — unlike
   * every other model touched this series, there's no viewerSubs bug to avoid here
   * since customers were never meant to read this.
   */
  RateLine: a
    .model({
      customerId: a.id().required(),
      label: a.string().required(),
      unit: a.enum(['per_hour', 'per_stop', 'per_sign']),
      ratePerUnit: a.float().required(),
      sortOrder: a.integer(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read']),
    ]),

  /**
   * OperatorPayout - Tracks a driver-split payout owed to the operator assigned on a
   * customer's routes for a billing period. operatorSub is a genuine Cognito sub (unlike
   * the customerId-as-FK mistake fixed repeatedly elsewhere in this schema), so it can
   * be used directly with ownerDefinedIn for the operator's own read access.
   */
  OperatorPayout: a
    .model({
      operatorSub: a.string().required(),
      customerId: a.id().required(),
      routeId: a.id(),
      periodStartDate: a.date(),
      periodEndDate: a.date(),
      amount: a.float().required(),
      status: a.enum(['pending', 'paid']),
      paidAt: a.datetime(),
      notes: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
      route: a.belongsTo('Route', 'routeId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('operatorSub').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * VanSignCount - An operator's count of signs physically on their van, taken once per
   * day before leaving the yard. operatorSub is a genuine Cognito sub (same pattern as
   * OperatorPayout above), so each operator only ever reads/writes their own count.
   */
  VanSignCount: a
    .model({
      operatorSub: a.string().required(),
      countDate: a.date().required(),
      standardCount: a.integer().required(),
      auctionCount: a.integer().required(),
      frameCount: a.integer().required(),
      countedAt: a.datetime(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('operatorSub').identityClaim('sub').to(['read', 'create', 'update']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
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
      // Cognito subs of all customer users — grants read access. customerId itself
      // can't be used with ownerDefinedIn since it's a foreign key, not a Cognito sub.
      viewerSubs: a.string().array(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
      invoice: a.belongsTo('Invoice', 'invoiceId'),
    })
    .authorization((allow) => [
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
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
      allow.groups(['administrator']).to(['read', 'create']),
      allow.groups(['operator']).to(['read', 'create']),
    ]),

  /**
   * CustomerUser - Associates a Cognito user with a customer account
   * role: account_owner can view invoices and the customer's user list
   *       read_only can only view routes and stops
   * accountOwnerSub is denormalized on every row so the account owner can read
   * all CustomerUser records for their customer via ownerDefinedIn('accountOwnerSub').
   * viewerSubs — same convention as Customer/Route/Stop/etc. — grants every
   * customer user (owner + read_only) read access to the whole team directory,
   * synced by customer-access-activation's handler and lib/queries.ts's
   * syncViewerSubsForCustomer whenever CustomerUser membership changes.
   * Only administrators may create, update, or delete CustomerUser records.
   */
  CustomerUser: a
    .model({
      customerId: a.id().required(), // FK to Customer
      userSub: a.string().required(), // Cognito sub of the associated user
      accountOwnerSub: a.string().required(), // Denormalized: account owner's sub (same for all rows per customer)
      name: a.string(),
      email: a.email(),
      role: a.enum(['account_owner', 'read_only']),
      viewerSubs: a.string().array(), // Cognito subs of all customer users — grants read access, same as Customer/Route/etc.
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('userSub').identityClaim('sub').to(['read']),           // each user reads own record
      allow.ownerDefinedIn('accountOwnerSub').identityClaim('sub').to(['read']),   // account owner reads all for their customer
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']),       // every customer user reads the whole team directory
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),  // only admins manage users
    ]),

  /**
   * OperatorAvailabilityBlock - A day Null Device has no drivers available for a customer.
   * One calendar per customer, written from the Null Device side only.
   * Enforced client-side against Route.scheduledDate at route creation
   * (lib/routeScheduleGuard.ts) — no server-side guard.
   */
  OperatorAvailabilityBlock: a
    .model({
      customerId: a.id().required(),
      date: a.date().required(),
      reason: a.string(),
      createdByOperatorId: a.id(),
      // Cognito subs of the target customer's users — stamped at creation from
      // Customer.viewerSubs, grants read access. customerId itself can't be used
      // with ownerDefinedIn since it's a foreign key, not a Cognito sub.
      viewerSubs: a.string().array(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      allow.groups(['operator']).to(['read', 'create', 'update', 'delete']),
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']), // customer views, can't write
    ]),

  /**
   * CustomerClosureBlock - A day the customer's agency is closed.
   * One calendar per customer, written from the customer side only.
   * Enforced client-side against Route.scheduledDate at route creation
   * (lib/routeScheduleGuard.ts) — no server-side guard.
   */
  CustomerClosureBlock: a
    .model({
      customerId: a.id().required(),
      date: a.date().required(),
      reason: a.string(),
      createdByUserSub: a.string(),
      // account_owner's sub, stamped at creation — grants that user read/write.
      // customerId itself can't be used with ownerDefinedIn since it's a foreign
      // key, not a Cognito sub.
      accountOwnerSub: a.string(),
      // Every customer user's sub for this customer, stamped at creation from
      // Customer.viewerSubs — grants read access to read_only users too.
      viewerSubs: a.string().array(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relationships
      customer: a.belongsTo('Customer', 'customerId'),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('accountOwnerSub').identityClaim('sub').to(['read', 'create', 'update', 'delete']),
      allow.ownersDefinedIn('viewerSubs').identityClaim('sub').to(['read']),
      allow.groups(['administrator']).to(['read']),
      allow.groups(['operator']).to(['read']),
    ]),

  /**
   * Administrator - Stores administrator profile details synced from Cognito.
   * Used by the admin management UI to display the user's name and email.
   */
  Administrator: a
    .model({
      name: a.string().required(),
      email: a.email().required(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
    ]),

  /**
   * UserSettings - Per-user UI preferences and profile label.
   * userSub maps to Cognito subject for owner-scoped access.
   */
  UserSettings: a
    .model({
      userSub: a.string().required(),
      name: a.string(),
      defaultTheme: a.enum(['system', 'light', 'dark']),
      mapTheme: a.enum(['light', 'dark', 'satellite', 'streets']),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('userSub').identityClaim('sub').to(['read', 'create', 'update', 'delete']),
      allow.groups(['administrator']).to(['read']),
    ]),

  /**
   * OrganizationSettings - Null Device's own invoice remittance details (company name, ABN,
   * phone, address, and the bank account invoices ask customers to pay into). Single row,
   * always fetched/created by the well-known id 'organization' -- there is one of these for
   * the whole business, not one per admin user (that was UserSettings' mistake pre-migration:
   * see git history). Staff-internal and printed onto invoices server-side; not customer-facing,
   * so only administrators get any access at all.
   */
  OrganizationSettings: a
    .model({
      companyName: a.string(),
      abn: a.string(),
      phone: a.string(),
      address: a.string(),
      paymentAccountName: a.string(),
      bsb: a.string(),
      accountNumber: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.groups(['administrator']).to(['read', 'create', 'update', 'delete']),
      // Read-only for operators: the Driver Sign Run flow's Load/Unload screens show
      // this row's `address` as the yard address (no dedicated yard field exists).
      allow.groups(['operator']).to(['read']),
    ]),
}).authorization((allow) => [
  allow.resource(customerAccessActivation).to(['query', 'mutate']),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  logging: {
    retention: '1 month',
    fieldLogLevel: 'error',
    excludeVerboseContent: true,
  },
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
