const mockRouteList = jest.fn();
const mockStopList = jest.fn();
const mockLineItemList = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Route: { list: mockRouteList },
      Stop: { list: mockStopList },
      LineItem: { list: mockLineItemList },
    },
  }),
}));

import { computeDriverSplit } from './driverSplit';

describe('computeDriverSplit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStopList.mockResolvedValue({ data: [] });
    mockLineItemList.mockResolvedValue({ data: [] });
  });

  it('falls back to actualDurationMinutes x billingRatePerHour when there are no line items', async () => {
    mockRouteList.mockResolvedValue({
      data: [
        {
          id: 'route-1',
          customerId: 'cust-1',
          status: 'completed',
          assignedOperatorSub: 'op-1',
          actualEndTime: '2026-08-10T12:00:00Z',
          actualDurationMinutes: 120,
        },
      ],
    });

    const result = await computeDriverSplit({
      customerId: 'cust-1',
      billingRatePerHour: 30,
      driverSplitPercent: 50,
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
    });

    expect(result.totalBilled).toBe(60);
    expect(result.totalDriverShare).toBe(30);
    expect(result.retained).toBe(30);
    expect(result.byOperator).toEqual([
      { operatorSub: 'op-1', billedAmount: 60, stopCount: 0, driverShare: 30 },
    ]);
  });

  it('uses summed line item amounts instead of the flat-rate fallback when line items exist', async () => {
    mockRouteList.mockResolvedValue({
      data: [
        {
          id: 'route-1',
          customerId: 'cust-1',
          status: 'completed',
          assignedOperatorSub: 'op-1',
          actualEndTime: '2026-08-10T12:00:00Z',
          actualDurationMinutes: 999, // should be ignored in favour of line items
        },
      ],
    });
    mockLineItemList.mockResolvedValue({
      data: [
        { id: 'li-1', routeId: 'route-1', amount: 100 },
        { id: 'li-2', routeId: 'route-1', amount: 50 },
      ],
    });

    const result = await computeDriverSplit({
      customerId: 'cust-1',
      billingRatePerHour: 30,
      driverSplitPercent: 20,
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
    });

    expect(result.totalBilled).toBe(150);
    expect(result.totalDriverShare).toBe(30);
  });

  it('excludes routes outside the requested period', async () => {
    mockRouteList.mockResolvedValue({
      data: [
        {
          id: 'route-1',
          customerId: 'cust-1',
          status: 'completed',
          assignedOperatorSub: 'op-1',
          actualEndTime: '2026-07-15T12:00:00Z',
          actualDurationMinutes: 60,
        },
      ],
    });

    const result = await computeDriverSplit({
      customerId: 'cust-1',
      billingRatePerHour: 30,
      driverSplitPercent: 50,
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
    });

    expect(result.byOperator).toEqual([]);
    expect(result.totalBilled).toBe(0);
  });

  it('excludes routes with an incomplete stop when paySplitOnCompletedStopsOnly is set', async () => {
    mockRouteList.mockResolvedValue({
      data: [
        {
          id: 'route-1',
          customerId: 'cust-1',
          status: 'completed',
          assignedOperatorSub: 'op-1',
          actualEndTime: '2026-08-10T12:00:00Z',
          actualDurationMinutes: 60,
        },
      ],
    });
    mockStopList.mockResolvedValue({
      data: [
        { id: 'stop-1', routeId: 'route-1', actualDepartureTime: '2026-08-10T10:00:00Z' },
        { id: 'stop-2', routeId: 'route-1', actualDepartureTime: null },
      ],
    });

    const result = await computeDriverSplit({
      customerId: 'cust-1',
      billingRatePerHour: 30,
      driverSplitPercent: 50,
      paySplitOnCompletedStopsOnly: true,
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
    });

    expect(result.byOperator).toEqual([]);
  });

  it('groups totals by assignedOperatorSub across multiple routes', async () => {
    mockRouteList.mockResolvedValue({
      data: [
        {
          id: 'route-1',
          customerId: 'cust-1',
          status: 'completed',
          assignedOperatorSub: 'op-1',
          actualEndTime: '2026-08-05T12:00:00Z',
          actualDurationMinutes: 60,
        },
        {
          id: 'route-2',
          customerId: 'cust-1',
          status: 'completed',
          assignedOperatorSub: 'op-2',
          actualEndTime: '2026-08-06T12:00:00Z',
          actualDurationMinutes: 120,
        },
      ],
    });

    const result = await computeDriverSplit({
      customerId: 'cust-1',
      billingRatePerHour: 30,
      driverSplitPercent: 10,
      periodStartDate: '2026-08-01',
      periodEndDate: '2026-08-31',
    });

    expect(result.byOperator).toEqual(
      expect.arrayContaining([
        { operatorSub: 'op-1', billedAmount: 30, stopCount: 0, driverShare: 3 },
        { operatorSub: 'op-2', billedAmount: 60, stopCount: 0, driverShare: 6 },
      ])
    );
    expect(result.totalBilled).toBe(90);
    expect(result.totalDriverShare).toBe(9);
    expect(result.retained).toBe(81);
  });
});
