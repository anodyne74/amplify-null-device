import { render, screen, fireEvent } from '@testing-library/react';
import InvoicePreview from './InvoicePreview';
import type { CustomerOption } from '@/app/administrator/invoices/types';

function baseProps() {
  const customer: CustomerOption = {
    id: 'cust-1',
    name: 'Harcourts Epping',
    addressLine1: '52 Beecroft Rd, Epping NSW 2121',
    billingRatePerHour: 60,
    driverSplitPercent: 28.5,
    groupLineItemsByAgent: false,
  };

  return {
    invoiceNumber: 'INV-2044',
    customer,
    route: { id: 'route-1', routeCode: 'R-101' } as never,
    rateLines: [],
    rateLineQuantities: {},
    totalHours: '4',
    totalAmount: '264',
    gstAmount: '24',
    stops: [
      { address: '1 Test St, Epping NSW 2121', agent: "Betty O'Shea", numberOfSigns: 3 },
      { address: '2 Test St, Epping NSW 2121', agent: 'David Mun', numberOfSigns: 2 },
    ],
    stopsLoading: false,
    billingCompanyName: 'Null Device Pty Ltd',
    billingAbn: 'ABN 48 221 604 992',
    billingPhone: '02 5555 5555',
    billingCompanyAddress: '1 Example St',
    billingPaymentAccountName: 'Null Device Pty Ltd',
    billingBsb: '123-456',
    billingAccountNumber: '12345678',
    onToggleGroupByAgent: jest.fn(),
  };
}

describe('InvoicePreview', () => {
  it('renders nothing when no customer is selected', () => {
    const { container } = render(<InvoicePreview {...baseProps()} customer={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the flat stop list and driver-split panel by default', () => {
    render(<InvoicePreview {...baseProps()} />);

    expect(screen.getByText('Harcourts Epping')).toBeInTheDocument();
    expect(screen.getByText('INV-2044')).toBeInTheDocument();
    expect(screen.getByText('1 Test St, Epping')).toBeInTheDocument();
    expect(screen.getByText("Betty O'Shea")).toBeInTheDocument();
    expect(screen.getByText('Driver share (28.5%)')).toBeInTheDocument();
    // billedAmount (preGst) = 264 - 24 = 240; 28.5% of 240 = 68.40
    expect(screen.getByText('$68.40')).toBeInTheDocument();
  });

  it('shows a grouped-by-agent breakdown when the customer setting is on', () => {
    const props = baseProps();
    render(<InvoicePreview {...props} customer={{ ...props.customer, groupLineItemsByAgent: true }} />);

    expect(screen.getByText("Betty O'Shea")).toBeInTheDocument();
    expect(screen.getByText('3 signs')).toBeInTheDocument();
    expect(screen.getByText('David Mun')).toBeInTheDocument();
    expect(screen.getByText('2 signs')).toBeInTheDocument();
  });

  it('reports the toggle change instead of managing grouping state itself', () => {
    const onToggleGroupByAgent = jest.fn();
    render(<InvoicePreview {...baseProps()} onToggleGroupByAgent={onToggleGroupByAgent} />);

    const groupSwitch = screen.getByLabelText('Group signs by agent for on-charging');
    fireEvent.click(groupSwitch);

    expect(onToggleGroupByAgent).toHaveBeenCalledWith(true);
    // Prop-driven: since `customer.groupLineItemsByAgent` is still false, the view doesn't
    // change until the parent re-renders with the updated customer.
    expect(screen.getByText("Betty O'Shea")).toBeInTheDocument();
    expect(screen.queryByText('3 signs')).not.toBeInTheDocument();
  });
});
