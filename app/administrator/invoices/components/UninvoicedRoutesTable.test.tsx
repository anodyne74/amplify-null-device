import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { Route } from '@/amplify/types';
import UninvoicedRoutesTable from '@/app/administrator/invoices/components/UninvoicedRoutesTable';

function createRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    customerId: 'cust-1',
    routeCode: 'R-101',
    status: 'completed',
    scheduledDate: '2026-09-10',
    overrideDurationMinutes: 245,
    ...overrides,
  } as Route;
}

describe('UninvoicedRoutesTable', () => {
  it('shows a loading message while loading', () => {
    render(<UninvoicedRoutesTable loading routes={[]} customerName={() => 'Acme'} />);
    expect(screen.getByText('Loading routes...')).toBeInTheDocument();
  });

  it('shows an empty state when there are no unbilled completed routes', () => {
    render(<UninvoicedRoutesTable loading={false} routes={[]} customerName={() => 'Acme'} />);
    expect(screen.getByText('No completed routes are waiting to be invoiced.')).toBeInTheDocument();
  });

  it('lists routes with a Generate invoice link pre-filling the route and customer', () => {
    render(
      <UninvoicedRoutesTable
        loading={false}
        routes={[createRoute()]}
        customerName={(id) => (id === 'cust-1' ? 'Acme Customer' : id)}
      />
    );

    expect(screen.getByText('R-101')).toBeInTheDocument();
    expect(screen.getByText('Acme Customer')).toBeInTheDocument();
    expect(screen.getByText('4h 5m')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Generate invoice' });
    expect(link).toHaveAttribute('href', '/administrator/invoices/generate?routeId=route-1&customerId=cust-1');
  });
});
