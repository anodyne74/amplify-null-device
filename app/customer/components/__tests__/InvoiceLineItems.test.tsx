import { render, screen } from '@testing-library/react';
import InvoiceLineItems from '../InvoiceLineItems';
import type { LineItem } from '@/amplify/types';

describe('InvoiceLineItems', () => {
  const mockLineItems: LineItem[] = [
    {
      id: 'line-1',
      invoiceId: 'invoice-1',
      description: 'Delivery Service - 10 stops',
      quantity: 10,
      ratePerUnit: 50.00,
      amount: 500.00,
      createdAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'line-2',
      invoiceId: 'invoice-1',
      description: 'Fuel surcharge',
      quantity: 1,
      ratePerUnit: 75.00,
      amount: 75.00,
      createdAt: '2024-01-15T10:00:00Z',
    },
  ];

  it('renders line items table', () => {
    const { container } = render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={575.00} />);

    expect(screen.getByText(/Description/i)).toBeInTheDocument();
    expect(screen.getByText(/Quantity/i)).toBeInTheDocument();
    expect(screen.getByText(/Rate/i)).toBeInTheDocument();
    
    // Check for table element to ensure structure exists
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
  });

  it('displays all line items with correct data', () => {
    render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={575.00} />);

    expect(screen.getByText(/Delivery Service - 10 stops/i)).toBeInTheDocument();
    expect(screen.getByText(/Fuel surcharge/i)).toBeInTheDocument();
  });

  it('formats currency in rate and amount columns', () => {
    render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={575.00} />);

    expect(screen.getAllByText(/\$50.00/i)).toBeDefined();
    expect(screen.getAllByText(/\$500.00/i)).toBeDefined();
  });

  it('displays total amount', () => {
    render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={575.00} />);

    expect(screen.getByText(/\$575.00/i)).toBeInTheDocument();
  });

  it('displays quantities correctly', () => {
    render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={575.00} />);

    const cells = screen.getAllByText(/10|1/);
    expect(cells.length).toBeGreaterThan(0);
  });

  it('handles empty line items', () => {
    render(<InvoiceLineItems lineItems={[]} totalAmount={0} />);

    expect(screen.getByText(/No line items found/i)).toBeInTheDocument();
  });

  it('handles null total amount', () => {
    render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={null} />);

    expect(screen.getByText(/\$0.00/i)).toBeInTheDocument();
  });

  it('renders table header row', () => {
    const { container } = render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={575.00} />);

    const thead = container.querySelector('thead');
    expect(thead).toBeInTheDocument();
  });

  it('renders table body with all items', () => {
    const { container } = render(<InvoiceLineItems lineItems={mockLineItems} totalAmount={575.00} />);

    const tbody = container.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr');
    expect(rows?.length).toBe(2);
  });
});
