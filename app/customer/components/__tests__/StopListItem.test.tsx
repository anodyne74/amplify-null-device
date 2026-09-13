import { render, screen } from '@testing-library/react';
import StopListItem from '../StopListItem';
import type { Stop } from '@/amplify/types';

describe('StopListItem', () => {
  const mockStop: Stop = {
    id: 'stop-1',
    routeId: 'route-1',
    sequence: 1,
    address: '123 Main Street',
    serviceType: 'delivery',
    estimatedArrivalTime: '2024-01-15T10:30:00Z',
    createdAt: '2024-01-15T10:00:00Z',
  };

  it('renders stop data correctly', () => {
    render(<StopListItem stop={mockStop} sequence={1} />);

    expect(screen.getByText(/123 Main Street/i)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting placement/i)).toBeInTheDocument();
  });

  it('reflects the pickup phase for pickup stops', () => {
    render(<StopListItem stop={{ ...mockStop, serviceType: 'pickup' }} sequence={1} />);
    expect(screen.getByText(/Awaiting pickup/i)).toBeInTheDocument();
  });

  it('shows placement and pickup completion times from execution markers', () => {
    const completedStop: Stop = {
      ...mockStop,
      notes: '[PLACEMENT_DONE:2026-08-31T10:00:00.000Z] [PICKUP_DONE:2026-08-31T11:00:00.000Z]',
    };

    render(<StopListItem stop={completedStop} sequence={1} />);
    expect(screen.getByText(/Picked up/i)).toBeInTheDocument();
    expect(screen.getByText(/Placed:/i)).toBeInTheDocument();
    expect(screen.getByText(/Picked up:/i)).toBeInTheDocument();
  });

  it('renders with notes when provided, stripped of execution markers', () => {
    const stopWithNotes: Stop = {
      ...mockStop,
      notes: 'Customer not home, left at gate [PLACEMENT_DONE:2026-08-31T10:00:00.000Z]',
    };

    render(<StopListItem stop={stopWithNotes} sequence={1} />);
    expect(screen.getByText(/Customer not home, left at gate/i)).toBeInTheDocument();
    expect(screen.queryByText(/PLACEMENT_DONE/i)).not.toBeInTheDocument();
  });

  it('handles stops without arrival time', () => {
    const { container } = render(
      <StopListItem stop={{ ...mockStop, estimatedArrivalTime: undefined }} sequence={1} />
    );
    expect(container).toBeInTheDocument();
  });
});
