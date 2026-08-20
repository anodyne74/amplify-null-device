'use client';

import { formatInvoiceCurrency } from '@/lib/format';
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
  return (
    <div>
      <h3 className={styles.heading}>Itemised charges</h3>

      <table className="nd-table">
        <thead>
          <tr>
            <th>Description</th>
            <th style={{ textAlign: 'center' }}>Quantity</th>
            <th style={{ textAlign: 'right' }}>Rate</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, index) => (
            <tr key={item.id || index}>
              <td>{item.description || `Service ${index + 1}`}</td>
              <td className="nd-table__num" style={{ textAlign: 'center' }}>
                {item.quantity || 0}
              </td>
              <td className="nd-table__num">{formatInvoiceCurrency(item.ratePerUnit)}</td>
              <td className="nd-table__num">{formatInvoiceCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {lineItems.length === 0 && <div className={styles.empty}>No line items found for this invoice.</div>}

      <div className={styles.totalsRow}>
        <div className={styles.totalsInner}>
          <span className={styles.totalsLabel}>Total amount</span>
          <span className={styles.totalsAmount}>{formatInvoiceCurrency(totalAmount)}</span>
        </div>
      </div>
    </div>
  );
}
