import { defineBackend, defineStorage } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';

const storage = defineStorage({
  name: 'invoiceStorage',
  access: (allow) => ({
    'invoices/*': [
      allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
    ],
    'schedules/*': [
      allow.groups(['administrator', 'operator']).to(['read', 'write', 'delete']),
    ],
  }),
});

defineBackend({ auth, data, storage });
