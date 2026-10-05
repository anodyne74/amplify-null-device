const mockAuditLogCreate = jest.fn();

jest.mock('@/lib/data-client', () => ({
  getDataClient: () => ({ models: { AuditLog: { create: (...args: unknown[]) => mockAuditLogCreate(...args) } } }),
}));
jest.mock('@/lib/amplify-config', () => ({ fetchUserId: jest.fn().mockResolvedValue('operator-sub') }));

import { auditMissingSign } from './missingSignAudit';

const stop = { id: 'stop-1', routeId: 'route-1', customerId: 'cust-1', propertyKey: 'epping|2121|eastcote road|44' };

describe('auditMissingSign (#468)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({ errors: undefined });
  });

  it.each([
    ['log', 'stop.missing_sign.log', 2],
    ['undo', 'stop.missing_sign.undo', 1],
  ] as const)('records a %s with the new count', async (change, action, count) => {
    await expect(auditMissingSign(stop, change, count)).resolves.toEqual({ ok: true });

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'operator-sub',
        customerId: 'cust-1',
        resourceType: 'stop',
        resourceId: 'stop-1',
        action,
        details: JSON.stringify({ routeId: 'route-1', missingSignsCount: count, propertyKey: 'epping|2121|eastcote road|44' }),
      })
    );
  });

  it('hands back a failed write rather than throwing', async () => {
    mockAuditLogCreate.mockResolvedValue({ errors: [{ message: 'nope' }] });

    await expect(auditMissingSign(stop, 'log', 1)).resolves.toEqual({ ok: false, errors: [{ message: 'nope' }] });
  });
});
