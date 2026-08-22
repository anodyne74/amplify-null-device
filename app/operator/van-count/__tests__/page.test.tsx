import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OperatorVanCountPage from '../page';
import { getVanSignCount } from '@/lib/queries/GetVanSignCount';
import { createVanSignCount } from '@/lib/queries/CreateVanSignCount';
import { updateVanSignCount } from '@/lib/queries/UpdateVanSignCount';

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ user: { userId: 'operator-sub-1' } }),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/queries/GetVanSignCount', () => ({
  getVanSignCount: jest.fn(),
}));

jest.mock('@/lib/queries/CreateVanSignCount', () => ({
  createVanSignCount: jest.fn(),
}));

jest.mock('@/lib/queries/UpdateVanSignCount', () => ({
  updateVanSignCount: jest.fn(),
}));

describe('Operator Van Count page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createVanSignCount as jest.Mock).mockResolvedValue({ data: { id: 'van-new' }, errors: undefined });
    (updateVanSignCount as jest.Mock).mockResolvedValue({ data: { id: 'van-1' }, errors: undefined });
  });

  it('shows zero counts when there is no existing record for today', async () => {
    (getVanSignCount as jest.Mock).mockResolvedValue({ data: null, errors: undefined });

    render(<OperatorVanCountPage />);

    await waitFor(() => {
      expect(getVanSignCount).toHaveBeenCalledWith('operator-sub-1', expect.any(String));
    });

    expect(await screen.findByText('Standard post')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBe(4); // total + 3 category rows
    expect(screen.queryByText(/last counted/i)).not.toBeInTheDocument();
  });

  it("loads today's existing count and shows the total", async () => {
    (getVanSignCount as jest.Mock).mockResolvedValue({
      data: {
        id: 'van-1',
        operatorSub: 'operator-sub-1',
        countDate: '2026-08-22',
        standardCount: 48,
        auctionCount: 14,
        frameCount: 12,
        countedAt: '2026-08-22T06:15:00Z',
      },
      errors: undefined,
    });

    render(<OperatorVanCountPage />);

    expect(await screen.findByText('74')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/last counted/i)).toBeInTheDocument();
  });

  it('increments and does not go below zero when decrementing', async () => {
    (getVanSignCount as jest.Mock).mockResolvedValue({ data: null, errors: undefined });

    render(<OperatorVanCountPage />);
    await screen.findByText('Standard post');

    const standardRow = screen.getByText('Standard post').closest('div')?.parentElement as HTMLElement;

    fireEvent.click(within(standardRow).getByRole('button', { name: 'Increase Standard post' }));
    fireEvent.click(within(standardRow).getByRole('button', { name: 'Increase Standard post' }));
    fireEvent.click(within(standardRow).getByRole('button', { name: 'Decrease Standard post' }));

    expect(within(standardRow).getByText('1')).toBeInTheDocument();

    fireEvent.click(within(standardRow).getByRole('button', { name: 'Decrease Standard post' }));
    fireEvent.click(within(standardRow).getByRole('button', { name: 'Decrease Standard post' }));

    expect(within(standardRow).getByText('0')).toBeInTheDocument();
  });

  it('creates a new count record when none exists yet', async () => {
    (getVanSignCount as jest.Mock).mockResolvedValue({ data: null, errors: undefined });

    render(<OperatorVanCountPage />);
    await screen.findByText('Standard post');

    fireEvent.click(screen.getByRole('button', { name: 'Increase Standard post' }));
    fireEvent.click(screen.getByRole('button', { name: /save count/i }));

    await waitFor(() => {
      expect(createVanSignCount).toHaveBeenCalledWith({
        operatorSub: 'operator-sub-1',
        countDate: expect.any(String),
        standardCount: 1,
        auctionCount: 0,
        frameCount: 0,
        countedAt: expect.any(String),
      });
    });
    expect(await screen.findByText(/van count saved/i)).toBeInTheDocument();
  });

  it('updates the existing count record', async () => {
    (getVanSignCount as jest.Mock).mockResolvedValue({
      data: {
        id: 'van-1',
        operatorSub: 'operator-sub-1',
        countDate: '2026-08-22',
        standardCount: 48,
        auctionCount: 14,
        frameCount: 12,
        countedAt: '2026-08-22T06:15:00Z',
      },
      errors: undefined,
    });

    render(<OperatorVanCountPage />);
    await screen.findByText('74');

    fireEvent.click(screen.getByRole('button', { name: 'Increase Auction rider' }));
    fireEvent.click(screen.getByRole('button', { name: /save count/i }));

    await waitFor(() => {
      expect(updateVanSignCount).toHaveBeenCalledWith('van-1', {
        standardCount: 48,
        auctionCount: 15,
        frameCount: 12,
        countedAt: expect.any(String),
      });
    });
  });
});
