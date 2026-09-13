import InvoiceDetailContent from './_InvoiceDetailContent';

export default async function CustomerInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <InvoiceDetailContent params={resolvedParams} />;
}
