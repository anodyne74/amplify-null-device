import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Route } from '@/amplify/types';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import InvoiceCreateForm from '@/app/administrator/invoices/components/InvoiceCreateForm';

const customers: CustomerOption[] = [
  { id: 'cust-1', name: 'Acme' },
  { id: 'cust-2', name: 'Beta' },
];

const customerRoutes: Route[] = [
  { id: 'route-1', customerId: 'cust-1', routeCode: 'R-100' },
  { id: 'route-2', customerId: 'cust-1' },
];

describe('InvoiceCreateForm', () => {
  it('renders fields and dispatches change handlers', () => {
    const onCustomerChange = jest.fn();
    const onRouteChange = jest.fn();
    const onInvoiceNumberChange = jest.fn();
    const onTotalHoursChange = jest.fn();
    const onTotalAmountChange = jest.fn();
    const onSubmit = jest.fn((event) => event.preventDefault());

    render(
      <InvoiceCreateForm
        customerId="cust-1"
        routeId=""
        invoiceNumber="INV-1"
        totalHours="2"
        totalAmount="200"
        saving={false}
        customers={customers}
        customerRoutes={customerRoutes}
        onCustomerChange={onCustomerChange}
        onRouteChange={onRouteChange}
        onInvoiceNumberChange={onInvoiceNumberChange}
        onTotalHoursChange={onTotalHoursChange}
        onTotalAmountChange={onTotalAmountChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cust-2' } });
    expect(onCustomerChange).toHaveBeenCalledWith('cust-2');

    fireEvent.change(screen.getByLabelText('Linked Route'), { target: { value: 'route-1' } });
    expect(onRouteChange).toHaveBeenCalledWith('route-1');

    fireEvent.change(screen.getByLabelText('Invoice Number'), { target: { value: 'INV-2' } });
    expect(onInvoiceNumberChange).toHaveBeenCalledWith('INV-2');

    fireEvent.change(screen.getByLabelText('Total Hours'), { target: { value: '3.5' } });
    expect(onTotalHoursChange).toHaveBeenCalledWith('3.5');

    fireEvent.change(screen.getByLabelText('Total Amount'), { target: { value: '350' } });
    expect(onTotalAmountChange).toHaveBeenCalledWith('350');

    fireEvent.submit(screen.getByRole('button', { name: 'Create Invoice' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows saving label when submitting', () => {
    render(
      <InvoiceCreateForm
        customerId="cust-1"
        routeId=""
        invoiceNumber="INV-1"
        totalHours="2"
        totalAmount="200"
        saving
        customers={customers}
        customerRoutes={customerRoutes}
        onCustomerChange={jest.fn()}
        onRouteChange={jest.fn()}
        onInvoiceNumberChange={jest.fn()}
        onTotalHoursChange={jest.fn()}
        onTotalAmountChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const submitButton = screen.getByRole('button', { name: 'Creating...' });
    expect(submitButton).toBeDisabled();
  });
});
