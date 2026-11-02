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
  it('asks for the distance to be entered by hand', () => {
    render(<FinaliseAdjusters adjusters={adjusters} />);

    expect(screen.getByText(/not tracked, enter manually/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Distance (km)')).toHaveValue('12.0');
  });
});
