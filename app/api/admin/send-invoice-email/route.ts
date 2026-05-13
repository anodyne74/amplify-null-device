import { NextRequest, NextResponse } from 'next/server';
import { GetTemplateCommand, SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';
import { listCustomerUsers, getCustomer, updateInvoice } from '@/lib/queries';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const invoiceTemplateName = process.env.SES_INVOICE_TEMPLATE_NAME || 'NullDeviceInvoiceTemplate';
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
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => values[key] ?? '');
}

function wrapBase64(base64: string): string {
  const width = 76;
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += width) {
    lines.push(base64.slice(i, i + width));
  }
  return lines.join('\r\n');
}

async function getTemplateParts() {
  const result = await sesClient.send(
    new GetTemplateCommand({ TemplateName: invoiceTemplateName })
  );

  const template = result.Template;
  if (!template?.HtmlPart || !template.TextPart || !template.SubjectPart) {
    throw new Error(`SES template ${invoiceTemplateName} is missing required parts.`);
  }

  return {
    htmlPart: template.HtmlPart,
    textPart: template.TextPart,
    subjectPart: template.SubjectPart,
  };
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

    // Build template values and render body from deployed SES template.
    const invoiceDateString = invoice.invoiceDate || new Date().toISOString().split('T')[0];
    const invoiceAmount = `$${invoice.totalAmount.toFixed(2)}`;
    const templateValues = {
      invoiceNumber: invoice.invoiceNumber,
      customerName: customer.name || 'Customer',
      invoiceDate: invoiceDateString,
      totalAmount: invoiceAmount,
      pdfUrl,
      year: `${new Date().getUTCFullYear()}`,
    };

    const templateParts = await getTemplateParts();
    const htmlBody = renderEmailTemplate(templateParts.htmlPart, templateValues);
    const plainTextBody = renderEmailTemplate(templateParts.textPart, templateValues);
    const subject = renderEmailTemplate(templateParts.subjectPart, templateValues);

    // Fetch PDF bytes from the signed URL so it can be attached to the message.
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch invoice PDF for attachment' }, { status: 500 });
    }
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfFileName = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
    const encodedPdf = wrapBase64(Buffer.from(pdfBytes).toString('base64'));

    // Send email via SES as a raw MIME message to include the PDF attachment.
    const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';
    const mixedBoundary = `mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const altBoundary = `alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const rawMessage = [
      `From: ${senderEmail}`,
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      plainTextBody,
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      htmlBody,
      '',
      `--${altBoundary}--`,
      '',
      `--${mixedBoundary}`,
      `Content-Type: application/pdf; name="${pdfFileName}"`,
      `Content-Disposition: attachment; filename="${pdfFileName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      encodedPdf,
      '',
      `--${mixedBoundary}--`,
      '',
    ].join('\r\n');

    const command = new SendRawEmailCommand({
      RawMessage: {
        Data: new TextEncoder().encode(rawMessage),
      },
      Source: senderEmail,
      Destinations: [toEmail],
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
