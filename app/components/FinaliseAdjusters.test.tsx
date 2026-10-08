import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FinaliseAdjusters } from './FinaliseAdjusters';

jest.mock('./FinaliseAdjusters.module.css', () => ({}), { virtual: true });

const adjusters = {
  measured: null,
  billedMinutes: { load: 30, placement: 30, pickup: 30, unload: 30 },
  bumpBilled: jest.fn(),
  distanceInput: '12.0',
  setDistanceInput: jest.fn(),
  distanceError: null,
  bumpKm: jest.fn(),
  billTotal: 120,
  billAligned: true,
  nextQuarterHour: 120,
  roundUp: jest.fn(),
} as never;

describe('FinaliseAdjusters distance row', () => {
  it('shows the Route Estimate beside the distance as a sanity check, without changing the entered distance', () => {
    render(<FinaliseAdjusters adjusters={adjusters} estimateMeters={13400} />);

    expect(screen.getByText(/Route Estimate 13\.4 km/)).toBeInTheDocument();
    expect(screen.getByLabelText('Distance (km)')).toHaveValue('12.0');
  });

  it('shows nothing about an estimate when there is none', () => {
    render(<FinaliseAdjusters adjusters={adjusters} />);

    expect(screen.queryByText(/Route Estimate/)).not.toBeInTheDocument();
    expect(screen.getByText(/not tracked, enter manually/i)).toBeInTheDocument();
  });
});
