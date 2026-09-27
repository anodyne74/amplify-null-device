import { defineFunction } from '@aws-amplify/backend';

/**
 * The daily retention job for Property History Reports (#292): destroys the
 * PDF of every report past its purgeAfter date (lib/reportRetention.ts). It
 * lives with the data stack, whose API it calls; amplify/backend.ts grants it
 * delete on the bucket's reports/ path and passes the bucket name.
 */
export const reportPurge = defineFunction({
  name: 'report-purge',
  entry: './handler.ts',
  schedule: 'every day',
  timeoutSeconds: 300,
  resourceGroupName: 'data',
});
