import { defineStorage } from '@aws-amplify/backend';

// No rule covers reports/: Property History Reports are read only through the
// reports API, which checks the caller's Customer (#291; amplify/backend.ts
// grants the SSR role alone access there).
export const storage = defineStorage({
  name: 'invoiceStorage',
  access: (allow) => ({
    'invoices/*': [
      allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete']),
      allow.groups(['customer']).to(['read']),
      allow.authenticated.to(['read', 'write']),
    ],
    'schedules/*': [
      allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read', 'write']),
    ],
  }),
});
