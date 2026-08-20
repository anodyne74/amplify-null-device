import InvoiceDetailContent from './_InvoiceDetailContent';

export default function CustomerInvoiceDetailPage({ params }: { params: { id: string } }) {
  return <InvoiceDetailContent params={params} />;
}
