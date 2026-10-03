import { customerPickupDate, defaultPickupDate, pickupDateProblem } from '@/lib/pickupDate';

describe('defaultPickupDate', () => {
  it('is the day after the Placement Date', () => {
    expect(defaultPickupDate('2026-10-09')).toBe('2026-10-10');
  });

  it('rolls over into the next month and year', () => {
    expect(defaultPickupDate('2026-12-31')).toBe('2027-01-01');
  });
});

describe('pickupDateProblem', () => {
  it('refuses a Pickup Date before the Placement Date', () => {
    expect(pickupDateProblem('2026-10-09', '2026-10-08')).toBe(
      'The pickup date must be on or after the placement date.'
    );
  });

  it('allows the same day or later', () => {
    expect(pickupDateProblem('2026-10-09', '2026-10-09')).toBeNull();
    expect(pickupDateProblem('2026-10-09', '2026-10-12')).toBeNull();
  });

  it('asks for a Pickup Date when there is none', () => {
    expect(pickupDateProblem('2026-10-09', '')).toBe('Choose a pickup date.');
  });
});

describe('customerPickupDate', () => {
  it('is the Pickup Date once one is set', () => {
    expect(customerPickupDate({ pickupDate: '2026-10-10', pickupStartTime: '2026-10-11T07:00:00Z' })).toBe('2026-10-10');
  });

  it('falls back to when Pickup started on a Route without a Pickup Date', () => {
    expect(customerPickupDate({ pickupDate: null, pickupStartTime: '2026-09-12T07:00:00Z' })).toBe('2026-09-12T07:00:00Z');
  });

  it('is unknown before either exists', () => {
    expect(customerPickupDate({})).toBeNull();
  });
});
