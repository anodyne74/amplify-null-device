import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { signedInvoicePdfUrl } from '@/lib/server/reportStorage';
import { listAll } from '@/lib/listAll';

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
    const auth = await authorizeIamRequest(request, ['customer', 'operator', 'administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { claims, client } = auth;

    const body = await request.json().catch(() => null);
    const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId.trim() : '';
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    let customerId: string | null = null;
    const groups = claims['cognito:groups'] ?? [];
    if (!groups.includes('administrator') && !groups.includes('operator')) {
      const { data: ownRows, errors } = await listAll(client, 'CustomerUser', {
        filter: { userSub: { eq: claims.sub } },
      });
      if (errors.length > 0) {
        console.error("Reading the caller's CustomerUser row failed:", errors);
        return NextResponse.json({ error: 'Could not open the invoice' }, { status: 500 });
      }
      const ownRow = ownRows.find((row) => row?.customerId);
      if (!ownRow || ownRow.role !== 'account_owner') {
        return NextResponse.json({ error: 'Forbidden: Account Owner access required' }, { status: 403 });
      }
      customerId = ownRow.customerId;
    }

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
