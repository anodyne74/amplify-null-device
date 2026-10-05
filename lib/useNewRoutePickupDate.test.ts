import { act, renderHook } from '@testing-library/react';
import type { StandingPickupDay } from '@/amplify/types';
import { useNewRoutePickupDate } from '@/lib/useNewRoutePickupDate';

type Props = { placementDate: string; customerId: string; standingPickupDay: StandingPickupDay | null };

function render(initial: Props) {
  return renderHook(
    ({ placementDate, customerId, standingPickupDay }: Props) =>
      useNewRoutePickupDate(placementDate, customerId, standingPickupDay),
    { initialProps: initial }
  );
}

describe('useNewRoutePickupDate', () => {
  it('starts on the day after placement for a Customer without a Standing Pickup Day', () => {
    const { result } = render({ placementDate: '2026-10-08', customerId: 'c1', standingPickupDay: null });
    expect(result.current.pickupDate).toBe('2026-10-09');
  });

  it('starts on the Customer\'s Standing Pickup Day after placement', () => {
    const { result } = render({ placementDate: '2026-10-08', customerId: 'c1', standingPickupDay: 'saturday' });
    expect(result.current.pickupDate).toBe('2026-10-10');
  });

  it('follows the Customer and the Placement Date until a date is chosen, then follows neither', () => {
    const { result, rerender } = render({ placementDate: '2026-10-08', customerId: 'c1', standingPickupDay: null });

    rerender({ placementDate: '2026-10-08', customerId: 'c2', standingPickupDay: 'saturday' });
    expect(result.current.pickupDate).toBe('2026-10-10');

    rerender({ placementDate: '2026-10-12', customerId: 'c2', standingPickupDay: 'saturday' });
    expect(result.current.pickupDate).toBe('2026-10-17');

    rerender({ placementDate: '2026-10-12', customerId: 'c1', standingPickupDay: null });
    expect(result.current.pickupDate).toBe('2026-10-13');

    act(() => result.current.choosePickupDate('2026-10-12'));
    rerender({ placementDate: '2026-10-14', customerId: 'c2', standingPickupDay: 'saturday' });
    expect(result.current.pickupDate).toBe('2026-10-12');
  });
});
