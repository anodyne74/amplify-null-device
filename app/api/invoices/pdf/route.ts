import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { signedInvoicePdfUrl } from '@/lib/server/reportStorage';

/**
 * A short-lived link to one invoice's PDF (#356): body { invoiceId }. Customer
 * users have no storage access to invoices/, so this is how an Account Owner
 * opens their own Customer's invoices; their Customer comes from their own
 * CustomerUser row, never the request. Administrators and operators may open
 * any invoice, as they may read any Invoice. An invoice the caller may not see
 * is reported as not found, the same as one with no PDF.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['customer', 'operator', 'administrator'], {
      accountOwnersOnly: true,
    });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { caller, client } = auth;

    const body = await request.json().catch(() => null);
    const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId.trim() : '';
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    const customerId = caller.audience === 'customer' ? caller.customerId : null;

    const { data: invoice, errors: invoiceErrors } = await client.models.Invoice.get({ id: invoiceId });
    if (invoiceErrors?.length) {
      console.error('Reading the invoice failed:', invoiceErrors);
      return NextResponse.json({ error: 'Could not open the invoice' }, { status: 500 });
    }
    if (!invoice?.pdfS3Key || (customerId !== null && invoice.customerId !== customerId)) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json({ url: await signedInvoicePdfUrl(invoice.pdfS3Key) });
  } catch (err) {
    console.error('Opening an invoice PDF failed:', err);
    return NextResponse.json({ error: 'Could not open the invoice' }, { status: 500 });
  }
}
