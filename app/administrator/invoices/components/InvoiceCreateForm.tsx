import type { FormEvent } from 'react';
import type { RateLine, Route } from '@/amplify/types';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import styles from '../page.module.css';

interface InvoiceCreateFormProps {
  customerId: string;
  routeId: string;
  invoiceNumber: string;
  totalHours: string;
  totalAmount: string;
  gstAmount: string;
  saving: boolean;
  customers: CustomerOption[];
  customerRoutes: Route[];
  rateLines: RateLine[];
  rateLineQuantities: Record<string, string>;
  onCustomerChange: (value: string) => void;
  onRouteChange: (value: string) => void;
  onInvoiceNumberChange: (value: string) => void;
  onTotalHoursChange: (value: string) => void;
  onTotalAmountChange: (value: string) => void;
  onRateLineQuantityChange: (rateLineId: string, value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export default function InvoiceCreateForm({
  customerId,
  routeId,
  invoiceNumber,
  totalHours,
  totalAmount,
  gstAmount,
  saving,
  customers,
  customerRoutes,
  rateLines,
  rateLineQuantities,
  onCustomerChange,
  onRouteChange,
  onInvoiceNumberChange,
  onTotalHoursChange,
  onTotalAmountChange,
  onRateLineQuantityChange,
  onSubmit,
}: InvoiceCreateFormProps) {
  const hasRateLines = rateLines.length > 0;
  return (
    <Card>
      <form onSubmit={onSubmit}>
        <h3 className={styles.formHeading}>Create Invoice</h3>

        <div className={styles.fieldsGrid}>
          <Field label="Customer" htmlFor="invoice-customer">
            <Select
              id="invoice-customer"
              value={customerId}
              onChange={(event) => onCustomerChange(event.target.value)}
              required
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Linked Route" htmlFor="invoice-route">
            <Select
              id="invoice-route"
              value={routeId}
              onChange={(event) => onRouteChange(event.target.value)}
            >
              <option value="">— None —</option>
              {customerRoutes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.routeCode ?? route.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Invoice Number" htmlFor="invoice-number">
            <Input
              id="invoice-number"
              value={invoiceNumber}
              onChange={(event) => onInvoiceNumberChange(event.target.value)}
              placeholder="INV-001"
              required
            />
          </Field>

          {hasRateLines ? (
            <div className={styles.fieldsGridFull}>
              <span className={styles.rateCardLabel}>Rate card lines</span>
              <div className={styles.rateLineRows}>
                {rateLines.map((line) => (
                  <div key={line.id} className={styles.rateLineRow}>
                    <span className={styles.rateLineName}>{line.label}</span>
                    <span className={styles.rateLineRate}>${line.ratePerUnit.toFixed(2)}</span>
                    <Input
                      aria-label={`Quantity for ${line.label}`}
                      value={rateLineQuantities[line.id] ?? ''}
                      onChange={(event) => onRateLineQuantityChange(line.id, event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Field label="Total Hours" htmlFor="invoice-hours">
              <Input
                id="invoice-hours"
                value={totalHours}
                onChange={(event) => onTotalHoursChange(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                required
              />
            </Field>
          )}

          <Field
            label="Total Amount"
            htmlFor="invoice-total"
            hint={Number(gstAmount) > 0 ? `Includes GST of $${gstAmount}` : undefined}
          >
            <Input
              id="invoice-total"
              value={totalAmount}
              onChange={(event) => onTotalAmountChange(event.target.value)}
              type="number"
              min="0"
              step="0.01"
              required
            />
          </Field>

          <Button type="submit" variant="primary" loading={saving} disabled={saving}>
            {saving ? 'Creating...' : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
