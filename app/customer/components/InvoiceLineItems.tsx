'use client';

interface LineItemDisplay {
  id?: string;
  invoiceId?: string;
  description?: string;
  quantity?: number;
  ratePerUnit?: number;
  amount?: number;
}

interface InvoiceLineItemsProps {
  lineItems?: LineItemDisplay[];
  totalAmount?: number | null;
}

/**
 * InvoiceLineItems component
 * Displays itemized charges table for an invoice
 */
export default function InvoiceLineItems({ lineItems = [], totalAmount }: InvoiceLineItemsProps) {
  // Format currency
  const formatCurrency = (amount?: number | null) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div style={{ padding: '16px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
        Itemized Charges
      </h3>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          borderTop: '1px solid #e0e0e0',
          borderBottom: '2px solid #1976d2',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
            <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', fontSize: '13px' }}>
              Description
            </th>
            <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', fontSize: '13px', width: '100px' }}>
              Quantity
            </th>
            <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', fontSize: '13px', width: '120px' }}>
              Rate
            </th>
            <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', fontSize: '13px', width: '120px' }}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, index) => (
            <tr
              key={item.id || index}
              style={{
                borderBottom: '1px solid #e0e0e0',
                backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa',
              }}
            >
              <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                {item.description || `Service ${index + 1}`}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '14px' }}>
                {item.quantity || 0}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px' }}>
                {formatCurrency(item.ratePerUnit)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '16px 8px',
          borderTop: '2px solid #1976d2',
          marginTop: '0',
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            Total Amount:
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#1976d2',
            }}
          >
            {formatCurrency(totalAmount)}
          </div>
        </div>
      </div>

      {/* No Items Message */}
      {lineItems.length === 0 && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#999',
            fontSize: '14px',
          }}
        >
          No line items found for this invoice.
        </div>
      )}
    </div>
  );
}
