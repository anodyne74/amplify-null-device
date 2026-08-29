/**
 * Type Definitions for Delivery Management System
 * 
 * This file exports all TypeScript types derived from the Amplify Data schema.
 * These types are automatically inferred by Amplify's ClientSchema<typeof schema> type.
 * 
 * Usage in frontend:
 * ```typescript
 * import type { Schema, Customer, Route, Invoice } from '@/amplify/types';
 * const client = generateClient<Schema>();
 * ```
 */

import type { Schema } from '../data/resource';

/**
 * Export the full schema for use with generateClient<Schema>()
 * Example: const client = generateClient<Schema>();
 */
export type { Schema };

/**
 * Model type aliases for convenience
 * These are the entity types from the Amplify schema
 * 
 * Note: The actual types are inferred by Amplify's ClientSchema<typeof schema>
 * when used with generateClient<Schema>(). These interfaces document the expected
 * shape of each entity returned from client.models.<Entity>.list() or .get()
 */

export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  email: string;
  contactPhone?: string;
  addressLine1?: string;
  standingInstructions?: string;
  defaultNumberOfSigns?: number | null;
  defaultAgentName?: string;
  defaultAgentInitials?: string;
  agentOptions?: string[] | null;
  status: CustomerStatus;
  billingRatePerHour: number;
  gstRegistered?: boolean | null;
  gstAbn?: string;
  directDebitAccountName?: string;
  directDebitBsb?: string;
  directDebitAccountNumber?: string;
  directDebitAuthorizedAt?: string | null;
  billingCycle?: BillingCycle | null;
  paymentTermsDays?: number | null;
  groupLineItemsByAgent?: boolean | null;
  autoSendInvoiceOnPeriodClose?: boolean | null;
  gstExclusive?: boolean | null;
  standingPickupDay?: StandingPickupDay | null;
  notifyOnLowSigns?: boolean | null;
  sendMissingSignsReport?: boolean | null;
  billingCcEmails?: string[] | null;
  attachAgentBreakdown?: boolean | null;
  sendPaymentReminder?: boolean | null;
  driverSplitPercent?: number | null;
  driverSplitBasis?: DriverSplitBasis | null;
  hideDriverSplitFromCustomer?: boolean | null;
  paySplitOnCompletedStopsOnly?: boolean | null;
  restrictInvitesToOwnDomain?: boolean | null;
  accountOwnerSub?: string | null;
  viewerSubs?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  routes?: Route[];
  invoices?: Invoice[];
  paymentRecords?: PaymentRecord[];
  users?: CustomerUser[];
  operatorAvailabilityBlocks?: OperatorAvailabilityBlock[];
  customerClosureBlocks?: CustomerClosureBlock[];
  rateLines?: RateLine[];
  payouts?: OperatorPayout[];
}

export type DriverSplitBasis = 'percentage_of_line_rate';

export type StandingPickupDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type BillingCycle = 'weekly' | 'fortnightly' | 'monthly';

export interface Operator {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  phone?: string | null;
  vehicleAndRego?: string | null;
  homeBase?: string | null;
  status?: OperatorStatus | null;
  driverSplitPercent?: number | null;
  payCycle?: BillingCycle | null;
  paySplitOnCompletedStopsOnly?: boolean | null;
  assignedCustomerIds?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
}

export type OperatorStatus = 'active' | 'onboarding' | 'inactive';

export interface Route {
  id: string;
  routeCode?: string | null;
  customerId: string;
  viewerSubs?: string[] | null;
  status?: RouteStatus | null;
  executionPhase?: RouteExecutionPhase | null;
  estimatedDurationMinutes?: number | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  placementStartTime?: string | null;
  placementEndTime?: string | null;
  pickupStartTime?: string | null;
  pickupEndTime?: string | null;
  actualDurationMinutes?: number | null;
  signsPlacedDistanceKm?: number | null;
  signsPickedUpDistanceKm?: number | null;
  overrideSigns?: number | null;
  overrideStops?: number | null;
  overrideDistanceKm?: number | null;
  overrideDurationMinutes?: number | null;
  overrideRate?: number | null;
  overrideAmount?: number | null;
  notes?: string;
  customerInstructions?: string;
  customerFeedbackTone?: 'good' | 'issue' | null;
  customerFeedbackNote?: string;
  drivingModeEnabled?: boolean | null;
  vanCount?: number | null;
  scheduleS3Key?: string | null;
  assignedOperatorSub?: string | null;
  assignedOperatorName?: string | null;
  assignedOperatorEmail?: string | null;
  assignedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
  stops?: Stop[];
  lineItems?: LineItem[];
  payouts?: OperatorPayout[];
}

export interface Stop {
  id: string;
  routeId: string;
  customerId?: string; // Denormalized for tenant-safe customer reads
  viewerSubs?: string[] | null;
  sequence?: number | null;
  address?: string;
  serviceType?: ServiceType | null;
  estimatedArrivalTime?: string | null;
  actualArrivalTime?: string | null;
  actualDepartureTime?: string | null;
  numberOfSigns?: number | null;
  agent?: string;
  isAuction?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  formattedAddress?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  route?: Route;
}

export interface Invoice {
  id: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  periodStartDate: string;
  periodEndDate: string;
  totalAmount: number;
  gstAmount?: number | null;
  status: InvoiceStatus;
  routeId?: string;
  pdfS3Key?: string;
  viewerSubs?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
  route?: Route;
  lineItems?: LineItem[];
}

export interface LineItem {
  id: string;
  invoiceId: string;
  routeId: string;
  customerId?: string; // Denormalized for tenant-safe customer reads
  description: string;
  quantity: number;
  ratePerUnit: number;
  amount: number;
  viewerSubs?: string[] | null;
  createdAt?: string;
  invoice?: Invoice;
  route?: Route;
}

export type RateLineUnit = 'per_hour' | 'per_stop' | 'per_sign';

export interface RateLine {
  id: string;
  customerId: string;
  label: string;
  unit?: RateLineUnit | null;
  ratePerUnit: number;
  sortOrder?: number | null;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
}

export type OperatorPayoutStatus = 'pending' | 'paid';

export interface OperatorPayout {
  id: string;
  operatorSub: string;
  customerId: string;
  routeId?: string | null;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  amount: number;
  status?: OperatorPayoutStatus | null;
  paidAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
  route?: Route;
}

export interface VanSignCount {
  id: string;
  operatorSub: string;
  countDate: string;
  standardCount: number;
  auctionCount: number;
  frameCount: number;
  countedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentRecord {
  id: string;
  customerId: string;
  invoiceId?: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  status: PaymentStatus;
  notes?: string;
  viewerSubs?: string[] | null;
  createdAt?: string;
  customer?: Customer;
  invoice?: Invoice;
}

export interface AuditLog {
  id: string;
  customerId?: string;
  operatorId?: string;
  eventType: AuditEventType;
  resourceType: AuditResourceType;
  resourceId: string;
  action: string;
  status: AuditStatus;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  createdAt?: string;
}

export interface CustomerUser {
  id: string;
  customerId: string;
  userSub: string;
  accountOwnerSub: string;
  name?: string;
  email?: string;
  role: CustomerUserRole;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
}

export interface Administrator {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSettings {
  id: string;
  userSub: string;
  name?: string;
  defaultTheme?: ThemeMode;
  mapTheme?: MapTheme;
  createdAt?: string;
  updatedAt?: string;
}

export interface OperatorAvailabilityBlock {
  id: string;
  customerId: string;
  date: string;
  reason?: string;
  createdByOperatorId?: string;
  viewerSubs?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
}

export interface CustomerClosureBlock {
  id: string;
  customerId: string;
  date: string;
  reason?: string;
  createdByUserSub?: string;
  accountOwnerSub?: string | null;
  viewerSubs?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
}

/**
 * Enums and union types from schema
 */

export type CustomerStatus = 'active' | 'inactive' | 'suspended';
export type CustomerUserRole = 'account_owner' | 'read_only';
export type OperatorRole = 'admin' | 'manager' | 'staff';
export type RouteStatus = 'planned' | 'in_progress' | 'signs_placed' | 'signs_picked_up' | 'completed' | 'archived';
export type RouteExecutionPhase = 'placement' | 'pickup';
export type ServiceType = 'delivery' | 'pickup' | 'inspection';
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod = 'credit_card' | 'bank_transfer' | 'check' | 'cash' | 'other';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled';
export type AuditEventType = 'login' | 'logout' | 'access_denied' | 'data_access' | 'data_modification' | 'data_deletion';
export type AuditResourceType = 'customer' | 'route' | 'invoice' | 'payment' | 'operator';
export type AuditStatus = 'success' | 'failure';
export type ThemeMode = 'system' | 'light' | 'dark';
export type MapTheme = 'light' | 'dark' | 'satellite' | 'streets';

/**
 * Request/Response types for common operations
 */

export interface CreateCustomerInput {
  name: string;
  email: string;
  contactPhone?: string;
  addressLine1?: string;
  standingInstructions?: string;
  defaultNumberOfSigns?: number;
  defaultAgentName?: string;
  defaultAgentInitials?: string;
  agentOptions?: string[];
  status: CustomerStatus;
  billingRatePerHour: number;
  gstRegistered?: boolean;
  gstAbn?: string;
  directDebitAccountName?: string;
  directDebitBsb?: string;
  directDebitAccountNumber?: string;
  directDebitAuthorizedAt?: string;
}

export interface UpdateCustomerInput {
  id: string;
  name?: string;
  email?: string;
  contactPhone?: string;
  addressLine1?: string;
  standingInstructions?: string;
  defaultNumberOfSigns?: number;
  defaultAgentName?: string;
  defaultAgentInitials?: string;
  agentOptions?: string[];
  status?: CustomerStatus;
  billingRatePerHour?: number;
  gstRegistered?: boolean;
  gstAbn?: string;
  directDebitAccountName?: string;
  directDebitBsb?: string;
  directDebitAccountNumber?: string;
  directDebitAuthorizedAt?: string;
}

export interface CreateRouteInput {
  routeCode?: string;
  customerId: string;
  viewerSubs?: string[];
  status: RouteStatus;
  executionPhase?: RouteExecutionPhase;
  notes?: string;
}

export interface UpdateRouteInput {
  id: string;
  routeCode?: string;
  customerId?: string;
  status?: RouteStatus;
  executionPhase?: RouteExecutionPhase;
  actualStartTime?: string;
  actualEndTime?: string;
  placementStartTime?: string;
  placementEndTime?: string;
  pickupStartTime?: string;
  pickupEndTime?: string;
  actualDurationMinutes?: number;
  signsPlacedDistanceKm?: number;
  signsPickedUpDistanceKm?: number;
  notes?: string;
  customerInstructions?: string;
  drivingModeEnabled?: boolean;
  vanCount?: number;
}

export interface CreateStopInput {
  routeId: string;
  customerId: string; // Required: must be set to the owning customer's sub/id
  viewerSubs?: string[];
  sequence: number;
  address: string;
  serviceType: ServiceType;
  estimatedArrivalTime?: string;
  numberOfSigns?: number;
  agent?: string;
  isAuction?: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  notes?: string;
}

export interface UpdateStopInput {
  id: string;
  sequence?: number;
  address?: string;
  serviceType?: ServiceType;
  estimatedArrivalTime?: string;
  actualArrivalTime?: string;
  actualDepartureTime?: string;
  numberOfSigns?: number;
  agent?: string;
  isAuction?: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  notes?: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  periodStartDate: string;
  periodEndDate: string;
  totalAmount: number;
  status: InvoiceStatus;
}

export interface UpdateInvoiceInput {
  id: string;
  status?: InvoiceStatus;
  totalAmount?: number;
}

export interface CreateLineItemInput {
  invoiceId: string;
  routeId: string;
  customerId: string; // Required: must be set to the owning customer's sub/id
  description: string;
  quantity: number;
  ratePerUnit: number;
  amount: number;
}

export interface CreatePaymentRecordInput {
  customerId: string;
  invoiceId?: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  status: PaymentStatus;
  notes?: string;
}

export interface CreateOperatorAvailabilityBlockInput {
  customerId: string;
  date: string;
  reason?: string;
  createdByOperatorId?: string;
}

export interface CreateCustomerClosureBlockInput {
  customerId: string;
  date: string;
  reason?: string;
  createdByUserSub?: string;
}

export interface CreateAuditLogInput {
  customerId?: string;
  operatorId?: string;
  eventType: AuditEventType;
  resourceType: AuditResourceType;
  resourceId: string;
  action: string;
  status: AuditStatus;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateCustomerUserInput {
  customerId: string;
  userSub: string;
  accountOwnerSub: string;
  role: CustomerUserRole;
  name?: string;
  email?: string;
}

export interface UpdateCustomerUserInput {
  id: string;
  name?: string;
  email?: string;
  role?: CustomerUserRole;
}

/**
 * Pagination and filtering types
 */

export interface PaginationParams {
  limit?: number;
  nextToken?: string;
}

export interface CustomerFilter {
  status?: CustomerStatus;
  email?: string;
}

export interface RouteFilter {
  customerId?: string;
  status?: RouteStatus;
  createdAt?: { between?: [string, string] };
}

export interface InvoiceFilter {
  customerId?: string;
  status?: InvoiceStatus;
  invoiceDate?: { between?: [string, string] };
}

/**
 * Response types for list operations
 */

export interface ListResponse<T> {
  data: T[];
  nextToken?: string;
  errors?: Array<{
    message: string;
    errorType?: string;
  }>;
}

export interface DataResponse<T> {
  data: T | null;
  errors?: Array<{
    message: string;
    errorType?: string;
  }>;
}
