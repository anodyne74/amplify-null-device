import { customerPickupDate, defaultPickupDate, pickupDateProblem } from '@/lib/pickupDate';

describe('defaultPickupDate', () => {
  it('is the day after the Placement Date', () => {
    expect(defaultPickupDate('2026-10-09')).toBe('2026-10-10');
  });

  it('rolls over into the next month and year', () => {
    expect(defaultPickupDate('2026-12-31')).toBe('2027-01-01');
  });

  it('is the day after when the Customer has no Standing Pickup Day', () => {
    expect(defaultPickupDate('2026-10-08', null)).toBe('2026-10-09');
    expect(defaultPickupDate('2026-10-08', undefined)).toBe('2026-10-09');
  });

  it.each([
    ['friday', '2026-10-09'],
    ['saturday', '2026-10-10'],
    ['sunday', '2026-10-11'],
    ['monday', '2026-10-12'],
    ['tuesday', '2026-10-13'],
    ['wednesday', '2026-10-14'],
    ['thursday', '2026-10-15'],
  ] as const)('is the first %s after a Thursday placement', (standingPickupDay, expected) => {
    expect(defaultPickupDate('2026-10-08', standingPickupDay)).toBe(expected);
  });

  it('treats a stored value that is not a weekday as no Standing Pickup Day', () => {
    expect(defaultPickupDate('2026-10-08', 'Saturday' as never)).toBe('2026-10-09');
  });

  it('is a week later when placement is already on the Standing Pickup Day', () => {
    expect(defaultPickupDate('2026-10-10', 'saturday')).toBe('2026-10-17');
  });

  it('rolls over into the next month and year with a Standing Pickup Day', () => {
    expect(defaultPickupDate('2026-10-29', 'monday')).toBe('2026-11-02');
    expect(defaultPickupDate('2026-12-30', 'saturday')).toBe('2027-01-02');
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
