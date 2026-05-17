import fs from 'fs';
import path from 'path';
import { uploadToS3 } from '../lib/pdfGenerator';
import { updateInvoicePdfKey } from '../lib/queries';

const BUCKET_NAME = 'your-s3-bucket-name';
const HISTORIC_INVOICES_DIR = path.resolve(__dirname, '../historic-invoices');

async function uploadHistoricInvoices() {
  const files = fs.readdirSync(HISTORIC_INVOICES_DIR);

  for (const file of files) {
    const filePath = path.join(HISTORIC_INVOICES_DIR, file);
    const s3Key = `invoices/historic/${file}`;

    try {
      await uploadToS3(filePath, BUCKET_NAME, s3Key);
      console.log(`Uploaded ${file} to S3 as ${s3Key}`);

      // Extract invoice ID from file name (assuming format: invoice-{id}.pdf)
      const invoiceId = file.match(/invoice-(\d+)\.pdf/)[1];
      await updateInvoicePdfKey(invoiceId, s3Key);
      console.log(`Updated invoice ${invoiceId} with S3 key ${s3Key}`);
    } catch (error) {
      console.error(`Failed to upload ${file}:`, error);
    }
  }
}

uploadHistoricInvoices().catch((error) => console.error('Error uploading historic invoices:', error));