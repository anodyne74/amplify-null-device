import { NextRequest, NextResponse } from 'next/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';
import { listCustomerUsers, getCustomer, updateInvoice } from '@/lib/queries';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;

let _client: ReturnType<typeof generateClient<Schema>> | null = null;
function getDataClient() {
  if (!_client) _client = generateClient<Schema>();
  return _client;
}

type VerifiedClaims = {
  sub?: string;
  email?: string;
  'cognito:groups'?: string[];
};

const verifier = userPoolId && userPoolClientId
  ? CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId: userPoolClientId,
    })
  : null;

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

function renderEmailTemplate(
  invoiceNumber: string,
  customerName: string,
  invoiceDate: string,
  totalAmount: number,
  pdfUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #333;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .header {
      background-color: #1a1a1a;
      color: white;
      padding: 20px;
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      background-color: white;
      padding: 20px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .invoice-details {
      margin-bottom: 20px;
      border-bottom: 1px solid #e0e0e0;
      padding-bottom: 15px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .detail-label {
      font-weight: 600;
      color: #555;
    }
    .detail-value {
      color: #333;
    }
    .amount {
      font-size: 20px;
      font-weight: 600;
      color: #2d7f2d;
    }
    .cta-button {
      display: inline-block;
      background-color: #1a1a1a;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 600;
      margin-top: 15px;
    }
    .footer {
      text-align: center;
      color: #999;
      font-size: 12px;
      padding: 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>NullDevice Invoice</h1>
    </div>
    <div class="content">
      <p>Hi ${customerName},</p>
      <p>Your invoice is ready for review and payment.</p>
      
      <div class="invoice-details">
        <div class="detail-row">
          <span class="detail-label">Invoice #</span>
          <span class="detail-value">${invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date</span>
          <span class="detail-value">${invoiceDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount Due</span>
          <span class="detail-value amount">$${totalAmount.toFixed(2)}</span>
        </div>
      </div>
      
      <p>Please click the button below to view or download your invoice:</p>
      <a href="${pdfUrl}" class="cta-button" target="_blank" rel="noopener noreferrer">View Invoice</a>
      
      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        If you have any questions about this invoice or our services, please don't hesitate to reach out.
      </p>
    </div>
    <div class="footer">
      <p>© 2026 NullDevice. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and admin status
    const token = getBearerToken(request);
    if (!token || !verifier) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let claims: VerifiedClaims;
    try {
      claims = (await verifier.verify(token)) as VerifiedClaims;
    } catch (err) {
      console.error('Token verification failed:', err);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userGroups = claims['cognito:groups'] || [];
    if (!userGroups.includes('administrator')) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { invoiceId, recipientEmail } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    // Query invoice details
    const { data: invoice, errors: invoiceErrors } = await getDataClient().models.Invoice.get({
      id: invoiceId,
    });

    if (invoiceErrors || !invoice) {
      console.error('Invoice fetch errors:', invoiceErrors);
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!invoice.pdfS3Key) {
      return NextResponse.json({ error: 'Invoice PDF not uploaded' }, { status: 400 });
    }

    // Query customer details
    const customerResult = await getCustomer(invoice.customerId);
    if (customerResult.errors && customerResult.errors.length > 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const customer = customerResult.data as any;
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Resolve recipient email: use provided, or find primary contact, or fallback to customer email
    let toEmail = recipientEmail;
    if (!toEmail) {
      // Try to find primary contact (account_owner role)
      const usersResult = await listCustomerUsers(invoice.customerId);
      const customerUsers = (usersResult.data as Array<{ role?: string | null; email?: string | null }> | undefined) || [];
      const owner = customerUsers.find((row) => row.role === 'account_owner' && row.email);
      toEmail = owner?.email || customer.email;
    }

    if (!toEmail) {
      return NextResponse.json({ error: 'No recipient email available' }, { status: 400 });
    }

    // Generate signed PDF URL (7-day expiration)
    let pdfUrl: string;
    try {
      const urlResult = await getUrl({ path: invoice.pdfS3Key, options: { expiresIn: 7 * 24 * 60 * 60 } });
      pdfUrl = urlResult.url.toString();
    } catch (err) {
      console.error('Failed to generate signed URL:', err);
      return NextResponse.json({ error: 'Failed to generate PDF link' }, { status: 500 });
    }

    // Render HTML email
    const invoiceDateString = invoice.invoiceDate || new Date().toISOString().split('T')[0];
    const htmlBody = renderEmailTemplate(
      invoice.invoiceNumber,
      customer.name,
      invoiceDateString,
      invoice.totalAmount,
      pdfUrl
    );

    const plainTextBody = `
Hello ${customer.name},

Your invoice is ready for review and payment.

Invoice #: ${invoice.invoiceNumber}
Date: ${invoiceDateString}
Amount Due: $${invoice.totalAmount.toFixed(2)}

Please visit this link to view or download your invoice:
${pdfUrl}

If you have any questions about this invoice or our services, please don't hesitate to reach out.

Regards,
NullDevice Administration

This is an automated message. Please do not reply to this email.
    `.trim();

    // Send email via SES
    const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';
    
    const command = new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: `Invoice ${invoice.invoiceNumber}` },
        Body: {
          Html: { Data: htmlBody },
          Text: { Data: plainTextBody },
        },
      },
    });

    let messageId: string;
    try {
      const result = await sesClient.send(command);
      messageId = result.MessageId || '';
      console.log(`Email sent to ${toEmail}, MessageId: ${messageId}`);
    } catch (err) {
      console.error('SES send failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: `Failed to send email: ${errorMessage}` }, { status: 500 });
    }

    // Update invoice with emailSentAt timestamp
    try {
      const now = new Date().toISOString();
      await updateInvoice(invoiceId, { emailSentAt: now });
    } catch (err) {
      console.warn('Failed to update invoice emailSentAt:', err);
      // Don't fail the entire operation if timestamp update fails
    }

    return NextResponse.json({
      success: true,
      messageId,
      sentTo: toEmail,
      invoiceNumber: invoice.invoiceNumber,
    });
  } catch (err) {
    console.error('Unexpected error in send-invoice-email:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
