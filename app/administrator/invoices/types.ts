export type CustomerOption = {
  id: string;
  name: string;
  email?: string;
  primaryEmail?: string;
  addressLine1?: string;
  billingRatePerHour?: number;
};

export type InvoiceStatus = 'draft' | 'finalized' | 'sent' | 'paid';

export type Invoice = {
  id: string;
  invoiceNumber: string;
  createdAt?: string | null;
  invoiceDate?: string | null;
  customerId: string;
  routeId?: string | null;
  pdfS3Key?: string | null;
  totalAmount: number;
  status?: InvoiceStatus | null;
  emailSentAt?: string | null;
};