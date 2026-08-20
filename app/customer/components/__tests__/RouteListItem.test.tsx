import { render, screen } from '@testing-library/react';
import { RouteStatusPill } from '../RouteListItem';

describe('RouteStatusPill', () => {
  it('renders the raw status label for an active-bucket status', () => {
    render(<RouteStatusPill status="signs_placed" />);
    expect(screen.getByText(/signs placed/i)).toBeInTheDocument();
  });

  it('renders planned status', () => {
    render(<RouteStatusPill status="planned" />);
    expect(screen.getByText(/planned/i)).toBeInTheDocument();
  });

  it('handles a missing status gracefully', () => {
    const { container } = render(<RouteStatusPill status={null} />);
    expect(container).toBeInTheDocument();
  });
});
