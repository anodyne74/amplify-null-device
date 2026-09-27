import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import outputs from '@/amplify_outputs.json';

/** Where Property History Report PDFs are kept -- the reports/ path of the app's bucket. */
export interface ReportStore {
  put(key: string, pdf: ArrayBuffer, filename: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** A link to the PDF that works for a few minutes, for the browser to open. */
  signedUrl(key: string): Promise<string>;
}

const SIGNED_URL_SECONDS = 300;

// amplify_outputs.json only has a storage section once the backend is deployed.
const storageOutputs = (outputs as { storage?: { bucket_name?: string; aws_region?: string } }).storage;

let _bucket: { s3: S3Client; bucket: string } | null = null;
let _store: ReportStore | null = null;

/**
 * The app's bucket, signed with the SSR role's own credentials (see
 * lib/server/iamDataClient.ts for why defaultProvider()). amplify/backend.ts
 * grants that role reports/ and read on invoices/, where no signed-in
 * customer has any access of their own, so callers must have checked the
 * caller's scope first.
 */
function appBucket(): { s3: S3Client; bucket: string } {
  if (_bucket) return _bucket;
  const bucket = storageOutputs?.bucket_name;
  if (!bucket) throw new Error('Storage is not configured (amplify_outputs.json has no storage bucket).');
  _bucket = { s3: new S3Client({ region: storageOutputs?.aws_region, credentials: defaultProvider() }), bucket };
  return _bucket;
}

function signedUrl(key: string): Promise<string> {
  const { s3, bucket } = appBucket();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: SIGNED_URL_SECONDS });
}

/** A few-minute link to an invoice PDF (#356), for a caller already checked against the invoice's Customer. */
export function signedInvoicePdfUrl(key: string): Promise<string> {
  return signedUrl(key);
}

/** The S3 report store; see appBucket() for who may reach it. */
export function getReportStore(): ReportStore {
  if (_store) return _store;
  const { s3, bucket } = appBucket();

  _store = {
    async put(key, pdf, filename) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: new Uint8Array(pdf),
          ContentType: 'application/pdf',
          ContentDisposition: `inline; filename="${filename}"`,
        })
      );
    },
    async remove(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    signedUrl,
  };
  return _store;
}
