import { defineFunction } from '@aws-amplify/backend';

export const operatorStatusActivation = defineFunction({
  name: 'operator-status-activation',
  entry: './handler.ts',
});
