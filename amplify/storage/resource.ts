import { defineStorage } from '@aws-amplify/backend';

// Only staff reach storage directly. No rule covers reports/: Property History
// Reports are read only through the reports API, which checks the caller's
// Customer (#291). Customers open invoice PDFs the same way, through the
// invoice PDF API (#356). amplify/backend.ts grants the SSR role what those
// routes need.
export const storage = defineStorage({
  name: 'invoiceStorage',
  access: (allow) => ({
    'invoices/*': [allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete'])],
    'schedules/*': [allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete'])],
  }),
});
