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
    expect(screen.getByText(/delivery/i)).toBeInTheDocument();
  });

  it('displays service type correctly', () => {
    render(
      <StopListItem stop={mockStop} sequence={1} />
    );
    expect(screen.getByText(/delivery/i)).toBeInTheDocument();
  });

  it('renders with notes when provided', () => {
    const stopWithNotes: Stop = {
      ...mockStop,
      notes: 'Customer not home, left at gate',
    };

    render(<StopListItem stop={stopWithNotes} sequence={1} />);
    expect(screen.getByText(/Customer not home, left at gate/i)).toBeInTheDocument();
  });

  it('handles stops without arrival time', () => {
    const { container } = render(
      <StopListItem stop={{ ...mockStop, estimatedArrivalTime: undefined }} sequence={1} />
    );
    expect(container).toBeInTheDocument();
  });
});
