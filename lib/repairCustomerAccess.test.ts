const callApiMock = jest.fn();
jest.mock('@/lib/apiClient', () => ({ callApi: (...args: unknown[]) => callApiMock(...args) }));

import { repairCustomerAccess } from '@/lib/repairCustomerAccess';

describe('repairCustomerAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls the repair route until it reports complete', async () => {
    callApiMock
      .mockResolvedValueOnce({ complete: false })
      .mockResolvedValueOnce({ complete: false })
      .mockResolvedValueOnce({ complete: true });

    await repairCustomerAccess();

    expect(callApiMock).toHaveBeenCalledTimes(3);
    expect(callApiMock).toHaveBeenCalledWith('/api/customer/sync-profile-access', {});
  });

  it('stops after one call when the first already completes', async () => {
    callApiMock.mockResolvedValue({ complete: true });
    await repairCustomerAccess();
    expect(callApiMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after a capped number of calls', async () => {
    callApiMock.mockResolvedValue({ complete: false });
    await repairCustomerAccess();
    expect(callApiMock).toHaveBeenCalledTimes(15);
  });

  it('stops on an error, leaving the repair to the next visit', async () => {
    callApiMock.mockResolvedValueOnce({ complete: false }).mockRejectedValueOnce(new Error('500'));
    await expect(repairCustomerAccess()).rejects.toThrow('500');
    expect(callApiMock).toHaveBeenCalledTimes(2);
  });
});
