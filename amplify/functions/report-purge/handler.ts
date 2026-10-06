import type { ScheduledHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Schema } from '../../data/resource';
import { purgeExpiredReports } from '../../../lib/reportRetention';

type RuntimeDataEnv = {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN: string;
  AWS_REGION: string;
  AMPLIFY_DATA_DEFAULT_NAME: string;
};

let configuredClient: ReturnType<typeof generateClient<Schema>> | null = null;

async function getDataClient() {
  if (configuredClient) {
    return configuredClient;
  }

  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(
    process.env as unknown as RuntimeDataEnv
  );
  Amplify.configure(resourceConfig, libraryOptions);
  configuredClient = generateClient<Schema>();
  return configuredClient;
}

const s3 = new S3Client({});

/**
 * Runs once a day. Reports that fail are left for tomorrow's run; the
 * invocation still fails so the error shows up in the function's metrics.
 */
export const handler: ScheduledHandler = async () => {
  const bucket = process.env.REPORTS_BUCKET_NAME;
  if (!bucket) throw new Error('REPORTS_BUCKET_NAME is not set');

  const client = await getDataClient();
  const { purged, failed } = await purgeExpiredReports(
    client,
    async (key) => {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    new Date()
  );

  console.log(`Purged ${purged.length} report(s)${purged.length ? `: ${purged.join(', ')}` : ''}`);
  if (failed.length > 0) throw new Error(`Could not purge ${failed.length} report(s): ${failed.join(', ')}`);
};
