export type CustomerOption = {
  id: string;
  name: string;
  email?: string;
  primaryEmail?: string;
  addressLine1?: string;
  billingRatePerHour?: number;
  gstExclusive?: boolean | null;
  viewerSubs?: string[] | null;
};

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export type Invoice = {
  id: string;
  invoiceNumber: string;
  createdAt?: string | null;
  invoiceDate?: string | null;
  customerId: string;
  routeId?: string | null;
  pdfS3Key?: string | null;
  totalAmount: number;
  gstAmount?: number | null;
  status?: InvoiceStatus | null;
  emailSentAt?: string | null;
  importedAt?: string | null;
};
