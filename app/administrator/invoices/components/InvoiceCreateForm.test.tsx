import '@testing-library/jest-dom';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RateLine, Route } from '@/amplify/types';
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

const rateLines: RateLine[] = [
  { id: 'line-1', customerId: 'cust-1', label: 'Placement', ratePerUnit: 30 } as RateLine,
  { id: 'line-2', customerId: 'cust-1', label: 'Pickup', ratePerUnit: 10 } as RateLine,
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
        gstAmount="0"
        saving={false}
        customers={customers}
        customerRoutes={customerRoutes}
        rateLines={[]}
        rateLineQuantities={{}}
        visibleRateLineIds={new Set()}
        onCustomerChange={onCustomerChange}
        onRouteChange={onRouteChange}
        onInvoiceNumberChange={onInvoiceNumberChange}
        onTotalHoursChange={onTotalHoursChange}
        onTotalAmountChange={onTotalAmountChange}
        onRateLineQuantityChange={jest.fn()}
        onAddRateLine={jest.fn()}
        onRemoveRateLine={jest.fn()}
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
        gstAmount="0"
        saving
        customers={customers}
        customerRoutes={customerRoutes}
        rateLines={[]}
        rateLineQuantities={{}}
        visibleRateLineIds={new Set()}
        onCustomerChange={jest.fn()}
        onRouteChange={jest.fn()}
        onInvoiceNumberChange={jest.fn()}
        onTotalHoursChange={jest.fn()}
        onTotalAmountChange={jest.fn()}
        onRateLineQuantityChange={jest.fn()}
        onAddRateLine={jest.fn()}
        onRemoveRateLine={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const submitButton = screen.getByRole('button', { name: 'Creating...' });
    expect(submitButton).toBeDisabled();
  });

  it('shows a GST hint under Total Amount when gstAmount is set', () => {
    render(
      <InvoiceCreateForm
        customerId="cust-1"
        routeId=""
        invoiceNumber="INV-1"
        totalHours="2"
        totalAmount="220"
        gstAmount="20.00"
        saving={false}
        customers={customers}
        customerRoutes={customerRoutes}
        rateLines={[]}
        rateLineQuantities={{}}
        visibleRateLineIds={new Set()}
        onCustomerChange={jest.fn()}
        onRouteChange={jest.fn()}
        onInvoiceNumberChange={jest.fn()}
        onTotalHoursChange={jest.fn()}
        onTotalAmountChange={jest.fn()}
        onRateLineQuantityChange={jest.fn()}
        onAddRateLine={jest.fn()}
        onRemoveRateLine={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByText('Includes GST of $20.00')).toBeInTheDocument();
  });

  it('shows a rate-line picker instead of Total Hours when the customer has rate lines', () => {
    const onRateLineQuantityChange = jest.fn();

    render(
      <InvoiceCreateForm
        customerId="cust-1"
        routeId=""
        invoiceNumber="INV-1"
        totalHours="0"
        totalAmount="540"
        gstAmount="0"
        saving={false}
        customers={customers}
        customerRoutes={customerRoutes}
        rateLines={rateLines}
        rateLineQuantities={{ 'line-1': '18' }}
        visibleRateLineIds={new Set()}
        onCustomerChange={jest.fn()}
        onRouteChange={jest.fn()}
        onInvoiceNumberChange={jest.fn()}
        onTotalHoursChange={jest.fn()}
        onTotalAmountChange={jest.fn()}
        onRateLineQuantityChange={onRateLineQuantityChange}
        onAddRateLine={jest.fn()}
        onRemoveRateLine={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    expect(screen.queryByLabelText('Total Hours')).not.toBeInTheDocument();
    expect(screen.getByText('Placement')).toBeInTheDocument();
    expect(screen.getByText('Pickup')).toBeInTheDocument();

    const placementQuantity = screen.getByLabelText('Quantity for Placement');
    expect(placementQuantity).toHaveValue(18);

    fireEvent.change(screen.getByLabelText('Quantity for Pickup'), { target: { value: '5' } });
    expect(onRateLineQuantityChange).toHaveBeenCalledWith('line-2', '5');
  });

  describe('progressive disclosure of rate lines', () => {
    const hoursLine: RateLine = {
      id: 'line-hours',
      customerId: 'cust-1',
      label: 'Sign distribution & collection',
      ratePerUnit: 60,
      unit: 'per_hour',
    } as RateLine;
    const otherLines: RateLine[] = [
      { id: 'line-extra', customerId: 'cust-1', label: 'Extra sign', ratePerUnit: 14, unit: 'per_sign' } as RateLine,
      { id: 'line-after', customerId: 'cust-1', label: 'After-hours surcharge', ratePerUnit: 95, unit: 'per_stop' } as RateLine,
    ];

    function renderForm(overrides: Partial<ComponentProps<typeof InvoiceCreateForm>> = {}) {
      return render(
        <InvoiceCreateForm
          customerId="cust-1"
          routeId=""
          invoiceNumber="INV-1"
          totalHours="0"
          totalAmount="120"
          gstAmount="0"
          saving={false}
          customers={customers}
          customerRoutes={customerRoutes}
          rateLines={[hoursLine, ...otherLines]}
          rateLineQuantities={{ 'line-hours': '2' }}
          visibleRateLineIds={new Set()}
          onCustomerChange={jest.fn()}
          onRouteChange={jest.fn()}
          onInvoiceNumberChange={jest.fn()}
          onTotalHoursChange={jest.fn()}
          onTotalAmountChange={jest.fn()}
          onRateLineQuantityChange={jest.fn()}
          onAddRateLine={jest.fn()}
          onRemoveRateLine={jest.fn()}
          onSubmit={jest.fn()}
          {...overrides}
        />
      );
    }

    it('shows only the per_hour line by default, with an Add rate card item button for the rest', () => {
      renderForm();

      expect(screen.getByText('Sign distribution & collection')).toBeInTheDocument();
      expect(screen.queryByText('Extra sign')).not.toBeInTheDocument();
      expect(screen.queryByText('After-hours surcharge')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+ Add rate card item' })).toBeInTheDocument();
    });

    it('reveals a picker of hidden lines and adds the chosen one on selection', () => {
      const onAddRateLine = jest.fn();
      renderForm({ onAddRateLine });

      fireEvent.click(screen.getByRole('button', { name: '+ Add rate card item' }));
      fireEvent.change(screen.getByLabelText('Choose a rate card item to add'), {
        target: { value: 'line-extra' },
      });

      expect(onAddRateLine).toHaveBeenCalledWith('line-extra');
    });

    it('shows added lines with a Remove control that excludes them again', () => {
      const onRemoveRateLine = jest.fn();
      renderForm({ visibleRateLineIds: new Set(['line-extra']), onRemoveRateLine });

      expect(screen.getByText('Extra sign')).toBeInTheDocument();
      expect(screen.queryByText('After-hours surcharge')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Remove Extra sign' }));
      expect(onRemoveRateLine).toHaveBeenCalledWith('line-extra');
    });

    it('falls back to showing all rate lines when the customer has no per_hour line', () => {
      renderForm({ rateLines: otherLines, rateLineQuantities: {} });

      expect(screen.getByText('Extra sign')).toBeInTheDocument();
      expect(screen.getByText('After-hours surcharge')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '+ Add rate card item' })).not.toBeInTheDocument();
    });
  });
});
