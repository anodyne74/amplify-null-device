import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminHomePage from '../page';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listInvoices } from '@/lib/queries';

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/queries/ListAllRoutes', () => ({
  listAllRoutes: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  listInvoices: jest.fn(),
}));

const mockCustomerList = jest.fn();
const mockStopList = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Customer: {
        list: mockCustomerList,
      },
      Stop: {
        list: mockStopList,
      },
    },
  }),
}));

describe('Administrator dashboard metrics visualisation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (listAllRoutes as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'route-1',
          customerId: 'customer-1',
          status: 'completed',
          actualEndTime: '2026-01-14T12:00:00Z',
          actualDurationMinutes: 120,
          signsPlacedDistanceKm: 12.5,
          signsPickedUpDistanceKm: 10,
          stops: 2,
          signsPlaced: 5,
          signsPickedUp: 5,
        },
        {
          id: 'route-2',
          customerId: 'customer-2',
          status: 'completed',
          actualEndTime: '2026-01-21T12:00:00Z',
          actualDurationMinutes: 60,
          signsPlacedDistanceKm: 5,
          signsPickedUpDistanceKm: 4,
          stops: 1,
          signsPlaced: 2,
          signsPickedUp: 2,
        },
      ],
      nextToken: undefined,
      errors: undefined,
    });

    (listInvoices as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'invoice-1',
          customerId: 'customer-1',
          totalAmount: 2000,
          invoiceDate: '2026-01-20T00:00:00Z',
          status: 'sent',
        },
        {
          id: 'invoice-2',
          customerId: 'customer-2',
          totalAmount: 500,
          invoiceDate: '2026-01-22T00:00:00Z',
          status: 'draft',
        },
      ],
      nextToken: undefined,
      errors: undefined,
    });

    mockCustomerList.mockResolvedValue({
      data: [
        { id: 'customer-1', name: 'Acme Corp' },
        { id: 'customer-2', name: 'Beta Signs' },
      ],
      nextToken: undefined,
      errors: undefined,
    });

    mockStopList.mockResolvedValue({
      data: [{ id: 'stop-1', numberOfSigns: 5 }],
      nextToken: undefined,
      errors: undefined,
    });
  });

  it('renders all-customer operational and financial charts by default', async () => {
    render(<AdminHomePage />);

    expect(screen.getByRole('heading', { name: /administrator portal/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /revenue trend/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /performance metrics/i })).toBeInTheDocument();
    expect(screen.getAllByText('All customers').length).toBeGreaterThan(0);
    const metricsHeading = screen.getByRole('heading', { name: /performance metrics/i });
    const activeRoutesLabel = screen.getByText('Active Routes');
    expect(metricsHeading.compareDocumentPosition(activeRoutesLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const scopeSelect = screen.getByLabelText(/dashboard scope/i);
    expect(scopeSelect).toHaveValue('all');
    expect(screen.getByRole('option', { name: /acme corp/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /beta signs/i })).toBeInTheDocument();
    fireEvent.change(scopeSelect, { target: { value: 'customer-2' } });
    expect(screen.getAllByText('Beta Signs').length).toBeGreaterThan(0);

    expect(screen.getByLabelText(/metrics period/i)).toHaveValue('month');
    expect(screen.getByRole('img', { name: /routes completed trend/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /distance trend/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /sign activity trend/i })).toBeInTheDocument();
  });
});
