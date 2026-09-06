import { render, screen } from '@testing-library/react';
import { RouteStatusPill } from '../RouteListItem';

describe('RouteStatusPill', () => {
  it('renders the phase label for an active-bucket status', () => {
    render(<RouteStatusPill route={{ status: 'signs_placed', executionPhase: 'placement' }} />);
    expect(screen.getByText(/signs placed/i)).toBeInTheDocument();
  });

  it('renders planned status', () => {
    render(<RouteStatusPill route={{ status: 'planned' }} />);
    expect(screen.getByText(/planned/i)).toBeInTheDocument();
  });

  it('handles a missing status gracefully', () => {
    const { container } = render(<RouteStatusPill route={{ status: null }} />);
    expect(container).toBeInTheDocument();
  });
});
