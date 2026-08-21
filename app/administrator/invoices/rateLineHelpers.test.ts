import { buildLineItemInputs } from './rateLineHelpers';
import type { RateLine } from '@/amplify/types';

describe('buildLineItemInputs', () => {
  const rateLines: RateLine[] = [
    { id: 'line-1', customerId: 'cust-1', label: 'Placement', ratePerUnit: 30 } as RateLine,
    { id: 'line-2', customerId: 'cust-1', label: 'Pickup', ratePerUnit: 10 } as RateLine,
    { id: 'line-3', customerId: 'cust-1', label: 'After-hours surcharge', ratePerUnit: 95 } as RateLine,
  ];

  it('builds one input per rate line with a positive quantity', () => {
    const inputs = buildLineItemInputs({
      rateLines,
      quantities: { 'line-1': '18', 'line-2': '18', 'line-3': '0' },
      invoiceId: 'inv-1',
      customerId: 'cust-1',
      routeId: 'route-1',
      viewerSubs: ['sub-a', 'sub-b'],
    });

    expect(inputs).toEqual([
      {
        invoiceId: 'inv-1',
        routeId: 'route-1',
        customerId: 'cust-1',
        description: 'Placement',
        quantity: 18,
        ratePerUnit: 30,
        amount: 540,
        viewerSubs: ['sub-a', 'sub-b'],
      },
      {
        invoiceId: 'inv-1',
        routeId: 'route-1',
        customerId: 'cust-1',
        description: 'Pickup',
        quantity: 18,
        ratePerUnit: 10,
        amount: 180,
        viewerSubs: ['sub-a', 'sub-b'],
      },
    ]);
  });

  it('skips rate lines with no quantity, a zero quantity, or a negative quantity', () => {
    const inputs = buildLineItemInputs({
      rateLines,
      quantities: { 'line-1': '', 'line-2': '-3' },
      invoiceId: 'inv-1',
      customerId: 'cust-1',
    });

    expect(inputs).toEqual([]);
  });

  it('omits routeId/viewerSubs when not provided', () => {
    const inputs = buildLineItemInputs({
      rateLines: [rateLines[0]],
      quantities: { 'line-1': '2' },
      invoiceId: 'inv-1',
      customerId: 'cust-1',
    });

    expect(inputs).toEqual([
      {
        invoiceId: 'inv-1',
        routeId: undefined,
        customerId: 'cust-1',
        description: 'Placement',
        quantity: 2,
        ratePerUnit: 30,
        amount: 60,
        viewerSubs: undefined,
      },
    ]);
  });
});
