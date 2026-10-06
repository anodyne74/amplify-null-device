import { missingSignAudit } from './missingSignAudit';

const stop = { id: 'stop-1', routeId: 'route-1', customerId: 'cust-1', propertyKey: 'epping|2121|eastcote road|44' };

describe('missingSignAudit (#468)', () => {
  it.each([
    ['log', 'stop.missingSign.log', 2],
    ['undo', 'stop.missingSign.undo', 1],
  ] as const)('describes a %s with the new count', (change, action, count) => {
    expect(missingSignAudit(stop, change, count)).toEqual({
      customerId: 'cust-1',
      resourceId: 'stop-1',
      action,
      details: { routeId: 'route-1', missingSignsCount: count, propertyKey: 'epping|2121|eastcote road|44' },
    });
  });

  it('records a Stop with no Property key as null', () => {
    expect(missingSignAudit({ ...stop, propertyKey: null }, 'log', 1).details).toMatchObject({ propertyKey: null });
  });
});
