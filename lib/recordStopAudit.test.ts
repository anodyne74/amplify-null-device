const mockGetDataClient = jest.fn();
jest.mock('@/lib/data-client', () => ({ getDataClient: () => mockGetDataClient() }));
jest.mock('@/lib/amplify-config', () => ({ fetchUserId: jest.fn().mockResolvedValue('operator-sub') }));
jest.mock('aws-amplify/auth', () => ({ fetchAuthSession: jest.fn() }));
jest.mock('@/lib/apiClient', () => ({ callApi: jest.fn() }));

import { recordStopAudit } from './signRunOutbox';

const audit = { customerId: 'cust-1', resourceId: 'stop-1', action: 'stop.missingSign.log', details: { missingSignsCount: 1 } };

describe('recordStopAudit (#468)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('writes the entry as the acting user', async () => {
    const create = jest.fn().mockResolvedValue({ errors: undefined });
    mockGetDataClient.mockReturnValue({ models: { AuditLog: { create } } });

    await recordStopAudit(audit);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: 'operator-sub', resourceType: 'stop', resourceId: 'stop-1', action: 'stop.missingSign.log' })
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs, and never rejects, when the entry is refused', async () => {
    mockGetDataClient.mockReturnValue({ models: { AuditLog: { create: jest.fn().mockResolvedValue({ errors: ['nope'] }) } } });

    await expect(recordStopAudit(audit)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('logs, and never rejects, when there is no data client to write with', async () => {
    mockGetDataClient.mockImplementation(() => {
      throw new TypeError('Cannot convert undefined or null to object');
    });

    await expect(recordStopAudit(audit)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
