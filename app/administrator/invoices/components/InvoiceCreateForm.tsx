import type { FormEvent } from 'react';
import type { Route } from '@/amplify/types';
import AdminFormField from '@/app/components/AdminFormField';
import AdminSectionHeader from '@/app/components/AdminSectionHeader';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import styles from '@/app/dashboard.module.css';
import invoiceStyles from '@/app/administrator/invoices/page.module.css';

interface InvoiceCreateFormProps {
  customerId: string;
  routeId: string;
  invoiceNumber: string;
  totalHours: string;
  totalAmount: string;
  saving: boolean;
  customers: CustomerOption[];
  customerRoutes: Route[];
  onCustomerChange: (value: string) => void;
  onRouteChange: (value: string) => void;
  onInvoiceNumberChange: (value: string) => void;
  onTotalHoursChange: (value: string) => void;
  onTotalAmountChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export default function InvoiceCreateForm({
  customerId,
  routeId,
  invoiceNumber,
  totalHours,
  totalAmount,
  saving,
  customers,
  customerRoutes,
  onCustomerChange,
  onRouteChange,
  onInvoiceNumberChange,
  onTotalHoursChange,
  onTotalAmountChange,
  onSubmit,
}: InvoiceCreateFormProps) {
  return (
    <form className={`${styles.infoPanel} ${invoiceStyles.createForm}`} onSubmit={onSubmit}>
      <AdminSectionHeader title="Create Invoice" titleClassName={invoiceStyles.panelHeading} />

      <div className={invoiceStyles.createGrid}>
        <AdminFormField label="Customer" htmlFor="invoice-customer" className={invoiceStyles.fieldGroup}>
          <select
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
          </select>
        </AdminFormField>

        <AdminFormField label="Linked Route" htmlFor="invoice-route" className={invoiceStyles.fieldGroup}>
          <select
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
          </select>
        </AdminFormField>

        <AdminFormField label="Invoice Number" htmlFor="invoice-number" className={invoiceStyles.fieldGroup}>
          <input
            id="invoice-number"
            value={invoiceNumber}
            onChange={(event) => onInvoiceNumberChange(event.target.value)}
            placeholder="INV-001"
            required
          />
        </AdminFormField>

        <AdminFormField label="Total Hours" htmlFor="invoice-hours" className={invoiceStyles.fieldGroup}>
          <input
            id="invoice-hours"
            value={totalHours}
            onChange={(event) => onTotalHoursChange(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </AdminFormField>

        <AdminFormField label="Total Amount" htmlFor="invoice-total" className={invoiceStyles.fieldGroup}>
          <input
            id="invoice-total"
            value={totalAmount}
            onChange={(event) => onTotalAmountChange(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </AdminFormField>

        <div className={`${invoiceStyles.fieldGroup} ${invoiceStyles.submitGroup}`}>
          <button type="submit" className={invoiceStyles.primaryButton} disabled={saving}>
            {saving ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </form>
  );
}