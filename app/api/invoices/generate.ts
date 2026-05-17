import { generateInvoicePDF, uploadToS3 } from '@/lib/pdfGenerator';
import { updateInvoicePdfKey } from '@/lib/queries';
import path from 'path';
import fs from 'fs';

export async function generateAndUploadInvoice(invoiceId: string, invoiceData: any) {
  const outputPath = path.resolve(`/tmp/invoice-${invoiceId}.pdf`);

  try {
    // Generate the PDF
    await generateInvoicePDF(invoiceData, outputPath);

    // Define S3 key
    const s3Key = `invoices/${invoiceId}.pdf`;

    // Upload to S3
    await uploadToS3(outputPath, process.env.S3_BUCKET_NAME, s3Key);

    // Update the invoice record
    await updateInvoicePdfKey(invoiceId, s3Key);

    // Clean up local file
    fs.unlinkSync(outputPath);

    console.log(`Invoice ${invoiceId} processed successfully.`);
  } catch (error) {
    console.error(`Failed to process invoice ${invoiceId}:`, error);
    throw error;
  }
}