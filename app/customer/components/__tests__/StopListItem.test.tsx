import { render, screen } from '@testing-library/react';
import StopListItem from '../StopListItem';
import type { Stop } from '@/amplify/types';

// Stops saved before #447 may still carry a service type; it must change nothing.
const withStoredServiceType = (stop: Stop, serviceType: string) => ({ ...stop, serviceType }) as Stop;

describe('StopListItem', () => {
  const mockStop: Stop = {
    id: 'stop-1',
    routeId: 'route-1',
    sequence: 1,
    address: '123 Main Street',
    estimatedArrivalTime: '2024-01-15T10:30:00Z',
    createdAt: '2024-01-15T10:00:00Z',
  };

  it('renders stop data correctly', () => {
    render(<StopListItem stop={mockStop} sequence={1} phase="placement" />);

    expect(screen.getByText(/123 Main Street/i)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting placement/i)).toBeInTheDocument();
  });

  it("shows the status for the Route's phase, whatever the stop's service type", () => {
    const { rerender } = render(<StopListItem stop={withStoredServiceType(mockStop, 'pickup')} sequence={1} phase="placement" />);
    expect(screen.getByText(/Awaiting placement/i)).toBeInTheDocument();

    rerender(<StopListItem stop={withStoredServiceType(mockStop, 'inspection')} sequence={1} phase="pickup" />);
    expect(screen.getByText(/Awaiting pickup/i)).toBeInTheDocument();
    expect(screen.queryByText(/inspection/i)).not.toBeInTheDocument();
  });

  it('shows placement and pickup completion times from execution markers', () => {
    const completedStop: Stop = {
      ...mockStop,
      notes: '[PLACEMENT_DONE:2026-08-31T10:00:00.000Z] [PICKUP_DONE:2026-08-31T11:00:00.000Z]',
    };

    render(<StopListItem stop={completedStop} sequence={1} phase="placement" />);
    expect(screen.getByText(/Picked up/i)).toBeInTheDocument();
    expect(screen.getByText(/Placed:/i)).toBeInTheDocument();
    expect(screen.getByText(/Picked up:/i)).toBeInTheDocument();
  });

  it('renders with notes when provided, stripped of execution markers', () => {
    const stopWithNotes: Stop = {
      ...mockStop,
      notes: 'Customer not home, left at gate [PLACEMENT_DONE:2026-08-31T10:00:00.000Z]',
    };

    render(<StopListItem stop={stopWithNotes} sequence={1} phase="placement" />);
    expect(screen.getByText(/Customer not home, left at gate/i)).toBeInTheDocument();
    expect(screen.queryByText(/PLACEMENT_DONE/i)).not.toBeInTheDocument();
  });

  it('handles stops without arrival time', () => {
    const { container } = render(
      <StopListItem stop={{ ...mockStop, estimatedArrivalTime: undefined }} sequence={1} phase="placement" />
    );
    expect(container).toBeInTheDocument();
  });

  it('colours the stop number by how far the stop has got', () => {
    const { rerender } = render(<StopListItem stop={mockStop} sequence={7} phase="placement" />);
    expect(screen.getByText('7')).toHaveClass('circleAwaiting');

    rerender(<StopListItem stop={{ ...mockStop, notes: '[PLACEMENT_DONE:2026-08-31T10:00:00.000Z]' }} sequence={7} phase="placement" />);
    expect(screen.getByText('7')).toHaveClass('circlePlaced');
  });

  it('shows a stop with a stored pickup service type exactly like one without', () => {
    const { container: withType } = render(<StopListItem stop={withStoredServiceType(mockStop, 'pickup')} sequence={1} phase="placement" />);
    const { container: without } = render(<StopListItem stop={mockStop} sequence={1} phase="placement" />);

    expect(withType.innerHTML).toBe(without.innerHTML);
  });
});
