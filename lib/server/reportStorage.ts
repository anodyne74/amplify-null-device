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

let _store: ReportStore | null = null;

/**
 * The S3 report store, signed with the SSR role's own credentials (see
 * lib/server/iamDataClient.ts for why defaultProvider()). amplify/backend.ts
 * grants that role reports/ and no signed-in user anything there, so callers
 * must have checked the caller's scope first.
 */
export function getReportStore(): ReportStore {
  if (_store) return _store;
  const bucket = storageOutputs?.bucket_name;
  if (!bucket) throw new Error('Storage is not configured (amplify_outputs.json has no storage bucket).');
  const s3 = new S3Client({ region: storageOutputs?.aws_region, credentials: defaultProvider() });

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
    signedUrl(key) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: SIGNED_URL_SECONDS });
    },
  };
  return _store;
}
