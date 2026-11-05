import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PhaseTrackBar } from '../PhaseTrackBar';

describe('PhaseTrackBar', () => {
  it('renders one segment per track entry and the caption', () => {
    const { container } = render(
      <PhaseTrackBar track={['done', 'current', 'upcoming', 'upcoming']} caption="Phase 2 of 4" />
    );

    expect(container.querySelectorAll('span[class*="trackSegment"]')).toHaveLength(4);
    expect(screen.getByText('Phase 2 of 4')).toBeInTheDocument();
  });

  it('names each segment with its phase and state', () => {
    render(<PhaseTrackBar track={['done', 'current', 'upcoming', 'upcoming', 'upcoming']} caption="Phase 2 of 4" />);

    expect(screen.getByRole('list', { name: 'Sign Run progress' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((el) => el.getAttribute('aria-label'))).toEqual([
      'Load, done',
      'Placement, current',
      'Pickup, upcoming',
      'Unload, upcoming',
      'Completed, upcoming',
    ]);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });

  it('puts Planned in front on the overview tracker', () => {
    render(
      <PhaseTrackBar track={['done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']} caption="Placement" />
    );

    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-label', 'Planned, done');
    expect(screen.getAllByRole('listitem')[5]).toHaveAttribute('aria-label', 'Completed, upcoming');
  });

  it('falls back to step numbers for a track of any other length', () => {
    render(<PhaseTrackBar track={['current', 'upcoming']} caption="x" />);

    expect(screen.getAllByRole('listitem').map((el) => el.getAttribute('aria-label'))).toEqual([
      'Step 1 of 2, current',
      'Step 2 of 2, upcoming',
    ]);
  });
});
