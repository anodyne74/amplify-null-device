import { defineFunction } from '@aws-amplify/backend';

export const customerAccessActivation = defineFunction({
  name: 'customer-access-activation',
  entry: './handler.ts',
});
