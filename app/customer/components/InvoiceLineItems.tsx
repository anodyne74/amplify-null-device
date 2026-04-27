'use client';

import styles from './InvoiceLineItems.module.css';

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
    <div className={styles.container}>
      <h3 className={styles.heading}>
        Itemized Charges
      </h3>

      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            <th className={`${styles.th} ${styles.thLeft}`}>
              Description
            </th>
            <th className={`${styles.th} ${styles.thCenter}`}>
              Quantity
            </th>
            <th className={`${styles.th} ${styles.thRight}`}>
              Rate
            </th>
            <th className={`${styles.th} ${styles.thRight}`}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody className={styles.tbody}>
          {lineItems.map((item, index) => (
            <tr key={item.id || index}>
              <td className={styles.td}>
                {item.description || `Service ${index + 1}`}
              </td>
              <td className={`${styles.td} ${styles.tdCenter}`}>
                {item.quantity || 0}
              </td>
              <td className={`${styles.td} ${styles.tdRight}`}>
                {formatCurrency(item.ratePerUnit)}
              </td>
              <td className={`${styles.td} ${styles.tdRight} ${styles.tdAmount}`}>
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total Row */}
      <div className={styles.totalsRow}>
        <div className={styles.totalsInner}>
          <div className={styles.totalsLabel}>
            Total Amount:
          </div>
          <div className={styles.totalsAmount}>
            {formatCurrency(totalAmount)}
          </div>
        </div>
      </div>

      {/* No Items Message */}
      {lineItems.length === 0 && (
        <div className={styles.empty}>
          No line items found for this invoice.
        </div>
      )}
    </div>
  );
}
