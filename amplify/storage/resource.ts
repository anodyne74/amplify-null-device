import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'invoiceStorage',
  access: (allow) => ({
    'invoices/*': [
      allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read', 'write']),
    ],
    'schedules/*': [
      allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read', 'write']),
    ],
  }),
});
