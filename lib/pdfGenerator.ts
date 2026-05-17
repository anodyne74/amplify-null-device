import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import AWS from 'aws-sdk';

const s3 = new AWS.S3();

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerEmail: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    ratePerUnit: number;
    amount: number;
  }>;
  totalAmount: number;
}

export async function generateInvoicePDF(invoiceData: InvoiceData, outputPath: string): Promise<void> {
  const templatePath = path.resolve(__dirname, '../templates/invoice-template.html');
  const template = fs.readFileSync(templatePath, 'utf-8');

  // Replace placeholders with actual data
  const html = template
    .replace('{{invoiceNumber}}', invoiceData.invoiceNumber)
    .replace('{{invoiceDate}}', invoiceData.invoiceDate)
    .replace('{{customerName}}', invoiceData.customerName)
    .replace('{{customerEmail}}', invoiceData.customerEmail)
    .replace('{{totalAmount}}', invoiceData.totalAmount.toFixed(2))
    .replace(
      '{{#each lineItems}}',
      invoiceData.lineItems
        .map(
          (item) => `
          <tr>
            <td>${item.description}</td>
            <td>${item.quantity}</td>
            <td>${item.ratePerUnit.toFixed(2)}</td>
            <td>${item.amount.toFixed(2)}</td>
          </tr>`
        )
        .join('')
    );

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: outputPath, format: 'A4' });
  await browser.close();
}

export async function uploadToS3(filePath: string, bucketName: string, key: string): Promise<void> {
  const fileContent = fs.readFileSync(filePath);
  await s3
    .upload({
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
    })
    .promise();
}

export { generateAndUploadInvoice } from '../app/api/invoices/generate';