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
  email: string;
  contactPhone?: string;
  status: CustomerStatus;
  billingRatePerHour: number;
  createdAt?: string;
  updatedAt?: string;
  routes?: Route[];
  invoices?: Invoice[];
  paymentRecords?: PaymentRecord[];
}

export interface Operator {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface Route {
  id: string;
  customerId: string;
  status?: RouteStatus | null;
  estimatedDurationMinutes?: number | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  actualDurationMinutes?: number | null;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
  stops?: Stop[];
  lineItems?: LineItem[];
}

export interface Stop {
  id: string;
  routeId: string;
  customerId?: string; // Denormalized for tenant-safe customer reads
  sequence?: number | null;
  address?: string;
  serviceType?: ServiceType | null;
  estimatedArrivalTime?: string | null;
  actualArrivalTime?: string | null;
  actualDepartureTime?: string | null;
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
  status: InvoiceStatus;
  createdAt?: string;
  updatedAt?: string;
  customer?: Customer;
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
  createdAt?: string;
  invoice?: Invoice;
  route?: Route;
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

/**
 * Enums and union types from schema
 */

export type CustomerStatus = 'active' | 'inactive' | 'suspended';
export type OperatorRole = 'admin' | 'manager' | 'staff';
export type RouteStatus = 'planned' | 'active' | 'completed' | 'archived';
export type ServiceType = 'delivery' | 'pickup' | 'inspection';
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod = 'credit_card' | 'bank_transfer' | 'check' | 'cash' | 'other';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled';
export type AuditEventType = 'login' | 'logout' | 'access_denied' | 'data_access' | 'data_modification' | 'data_deletion';
export type AuditResourceType = 'customer' | 'route' | 'invoice' | 'payment' | 'operator';
export type AuditStatus = 'success' | 'failure';

/**
 * Request/Response types for common operations
 */

export interface CreateCustomerInput {
  name: string;
  email: string;
  contactPhone?: string;
  status: CustomerStatus;
  billingRatePerHour: number;
}

export interface UpdateCustomerInput {
  id: string;
  name?: string;
  email?: string;
  contactPhone?: string;
  status?: CustomerStatus;
  billingRatePerHour?: number;
}

export interface CreateRouteInput {
  customerId: string;
  status: RouteStatus;
  estimatedDurationMinutes: number;
  notes?: string;
}

export interface UpdateRouteInput {
  id: string;
  status?: RouteStatus;
  actualStartTime?: string;
  actualEndTime?: string;
  actualDurationMinutes?: number;
  notes?: string;
}

export interface CreateStopInput {
  routeId: string;
  customerId: string; // Required: must be set to the owning customer's sub/id
  sequence: number;
  address: string;
  serviceType: ServiceType;
  estimatedArrivalTime?: string;
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
