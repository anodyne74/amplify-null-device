import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Schema } from '../../data/resource';
import { captureRouteRequest, type SesReceiptRecord } from '../../../lib/routeRequestCapture';

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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * SES invokes this asynchronously, so a thrown error makes Lambda retry the
 * delivery; the capture is idempotent on the SES message ID.
 */
export const handler = async (event: { Records: SesReceiptRecord[] }) => {
  const inboundBucket = requiredEnv('INBOUND_BUCKET_NAME');
  const appBucket = requiredEnv('APP_BUCKET_NAME');
  const ownDomain = requiredEnv('EMAIL_DOMAIN');
  const client = await getDataClient();

  for (const record of event.Records) {
    const outcome = await captureRouteRequest(record, {
      ownDomain,
      client,
      readRawMessage: async (key) => {
        const object = await s3.send(new GetObjectCommand({ Bucket: inboundBucket, Key: key }));
        if (!object.Body) throw new Error(`Inbound message ${key} has no body`);
        return object.Body.transformToByteArray();
      },
      putFile: async (key, content, contentType) => {
        await s3.send(new PutObjectCommand({ Bucket: appBucket, Key: key, Body: content, ContentType: contentType }));
      },
    });
    console.log(`Message ${record.ses.mail.messageId}: ${outcome}`);
  }
};
