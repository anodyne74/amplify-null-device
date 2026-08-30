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
});
