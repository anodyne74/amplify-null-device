import { aggregateRouteData } from './aggregateRouteData';

describe('aggregateRouteData', () => {
  const mockRoutes = [
    {
      createdAt: '2026-05-01T10:00:00.000Z',
      actualDurationMinutes: 120,
      signsPlacedDistanceKm: 50,
      signsPickedUpDistanceKm: 20,
      stops: 10,
      signsPlaced: 5,
      signsPickedUp: 3,
      status: 'completed',
      executionPhase: 'placement',
    },
    {
      createdAt: '2026-05-02T10:00:00.000Z',
      actualDurationMinutes: 90,
      signsPlacedDistanceKm: 30,
      signsPickedUpDistanceKm: 10,
      stops: 8,
      signsPlaced: 4,
      signsPickedUp: 2,
      status: 'planned',
      executionPhase: 'pickup',
    },
  ];

  const mockInvoices = [
    {
      invoiceDate: '2026-05-01',
      totalAmount: 1000,
    },
    {
      invoiceDate: '2026-05-02',
      totalAmount: 500,
    },
  ];

  it('aggregates data by day', () => {
    const result = aggregateRouteData(mockRoutes, mockInvoices, 'day');
    expect(result).toEqual([
      {
        dateGroup: '2026-05-01',
        routesCompleted: 1,
        totalDurationMinutes: 120,
        totalDistanceKm: 70,
        totalStops: 10,
        totalSignsPlaced: 5,
        totalSignsPickedUp: 3,
        totalRevenue: 1000,
        statusCounts: { completed: 1 },
        phaseCounts: { placement: 1 },
      },
      {
        dateGroup: '2026-05-02',
        routesCompleted: 1,
        totalDurationMinutes: 90,
        totalDistanceKm: 40,
        totalStops: 8,
        totalSignsPlaced: 4,
        totalSignsPickedUp: 2,
        totalRevenue: 500,
        statusCounts: { planned: 1 },
        phaseCounts: { pickup: 1 },
      },
    ]);
  });

  it('aggregates data by month', () => {
    const result = aggregateRouteData(mockRoutes, mockInvoices, 'month');
    expect(result).toEqual([
      {
        dateGroup: '2026-05',
        routesCompleted: 2,
        totalDurationMinutes: 210,
        totalDistanceKm: 110,
        totalStops: 18,
        totalSignsPlaced: 9,
        totalSignsPickedUp: 5,
        totalRevenue: 1500,
        statusCounts: { completed: 1, planned: 1 },
        phaseCounts: { placement: 1, pickup: 1 },
      },
    ]);
  });

  it('aggregates data by quarter', () => {
    const result = aggregateRouteData(mockRoutes, mockInvoices, 'quarter');
    expect(result).toEqual([
      {
        dateGroup: '2026-Q2',
        routesCompleted: 2,
        totalDurationMinutes: 210,
        totalDistanceKm: 110,
        totalStops: 18,
        totalSignsPlaced: 9,
        totalSignsPickedUp: 5,
        totalRevenue: 1500,
        statusCounts: { completed: 1, planned: 1 },
        phaseCounts: { placement: 1, pickup: 1 },
      },
    ]);
  });

  it('aggregates data by year', () => {
    const result = aggregateRouteData(mockRoutes, mockInvoices, 'year');
    expect(result).toEqual([
      {
        dateGroup: '2026',
        routesCompleted: 2,
        totalDurationMinutes: 210,
        totalDistanceKm: 110,
        totalStops: 18,
        totalSignsPlaced: 9,
        totalSignsPickedUp: 5,
        totalRevenue: 1500,
        statusCounts: { completed: 1, planned: 1 },
        phaseCounts: { placement: 1, pickup: 1 },
      },
    ]);
  });
});