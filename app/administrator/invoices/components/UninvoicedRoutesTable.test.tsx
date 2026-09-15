import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import type { Route } from '@/amplify/types';
import UninvoicedRoutesTable from '@/app/administrator/invoices/components/UninvoicedRoutesTable';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

function createRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    customerId: 'cust-1',
    routeCode: 'R-101',
    status: 'completed',
    scheduledDate: '2026-09-10',
    overrideDurationMinutes: 245,
    assignedOperatorName: 'Jane Driver',
    overrideStops: 12,
    overrideSigns: 30,
    ...overrides,
  } as Route;
}

describe('UninvoicedRoutesTable', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('shows a loading message while loading', () => {
    render(<UninvoicedRoutesTable loading routes={[]} customerName={() => 'Acme'} />);
    expect(screen.getByText('Loading routes...')).toBeInTheDocument();
  });

  it('shows an empty state when there are no unbilled completed routes', () => {
    render(<UninvoicedRoutesTable loading={false} routes={[]} customerName={() => 'Acme'} />);
    expect(screen.getByText('No completed routes are waiting to be invoiced.')).toBeInTheDocument();
  });

  it('lists routes with driver, stops and signs alongside the existing schedule/duration columns', () => {
    render(
      <UninvoicedRoutesTable
        loading={false}
        routes={[createRoute()]}
        customerName={(id) => (id === 'cust-1' ? 'Acme Customer' : id)}
      />
    );

    expect(screen.getByText('R-101')).toBeInTheDocument();
    expect(screen.getByText('Acme Customer')).toBeInTheDocument();
    expect(screen.getByText('Jane Driver')).toBeInTheDocument();
    expect(screen.getByText('4h 5m')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('only allows one route to be selected at a time, and disables Generate invoice until one is', () => {
    render(
      <UninvoicedRoutesTable
        loading={false}
        routes={[createRoute(), createRoute({ id: 'route-2', routeCode: 'R-102' })]}
        customerName={(id) => (id === 'cust-1' ? 'Acme Customer' : id)}
      />
    );

    const generateButton = screen.getByRole('button', { name: 'Generate invoice' });
    expect(generateButton).toBeDisabled();

    const firstRadio = screen.getByRole('radio', { name: 'Select route R-101 to invoice' });
    const secondRadio = screen.getByRole('radio', { name: 'Select route R-102 to invoice' });

    fireEvent.click(firstRadio);
    expect(firstRadio).toBeChecked();
    expect(generateButton).toBeEnabled();

    fireEvent.click(secondRadio);
    expect(secondRadio).toBeChecked();
    expect(firstRadio).not.toBeChecked();
  });

  it('navigates to the generate page pre-filled with the selected route and customer', () => {
    render(
      <UninvoicedRoutesTable
        loading={false}
        routes={[createRoute()]}
        customerName={(id) => (id === 'cust-1' ? 'Acme Customer' : id)}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Select route R-101 to invoice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));

    expect(push).toHaveBeenCalledWith('/administrator/invoices/generate?routeId=route-1&customerId=cust-1');
  });
});
