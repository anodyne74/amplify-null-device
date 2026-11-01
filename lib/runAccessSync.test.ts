const callApiMock = jest.fn();
jest.mock('@/lib/apiClient', () => ({ callApi: (...args: unknown[]) => callApiMock(...args) }));

import { MAX_SYNC_CALLS, runAccessSync } from '@/lib/runAccessSync';

describe('runAccessSync', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls the route with its body until it reports complete, adding up what was updated', async () => {
    callApiMock
      .mockResolvedValueOnce({ complete: false, updated: { Route: 2, Stop: 3 } })
      .mockResolvedValueOnce({ complete: true, updated: { Stop: 4 } });

    await expect(runAccessSync('/api/x', { customerId: 'c1' })).resolves.toEqual({ status: 'complete', updated: 9 });
    expect(callApiMock).toHaveBeenCalledTimes(2);
    expect(callApiMock).toHaveBeenCalledWith('/api/x', { customerId: 'c1' });
  });

  it('counts a response with no complete flag as complete', async () => {
    callApiMock.mockResolvedValue({ success: true });
    await expect(runAccessSync('/api/x', {})).resolves.toEqual({ status: 'complete', updated: 0 });
    expect(callApiMock).toHaveBeenCalledTimes(1);
  });

  it('reports progress after each call', async () => {
    callApiMock
      .mockResolvedValueOnce({ complete: false, updated: { Stop: 5 } })
      .mockResolvedValueOnce({ complete: true, updated: { Stop: 2 } });
    const onProgress = jest.fn();

    await runAccessSync('/api/x', {}, onProgress);

    expect(onProgress.mock.calls).toEqual([[5], [7]]);
  });

  it('gives up as incomplete after the call limit', async () => {
    callApiMock.mockResolvedValue({ complete: false, updated: {} });
    await expect(runAccessSync('/api/x', {})).resolves.toEqual({ status: 'incomplete' });
    expect(callApiMock).toHaveBeenCalledTimes(MAX_SYNC_CALLS);
  });

  it('ends as failed with the message when a call fails, after reporting earlier progress', async () => {
    callApiMock.mockResolvedValueOnce({ complete: false, updated: { Stop: 1 } }).mockRejectedValueOnce(new Error('Access sync finished with 2 error(s).'));
    const onProgress = jest.fn();

    await expect(runAccessSync('/api/x', {}, onProgress)).resolves.toEqual({ status: 'failed', message: 'Access sync finished with 2 error(s).' });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('gives a plain message when what was thrown is not an Error', async () => {
    callApiMock.mockRejectedValue('nope');
    await expect(runAccessSync('/api/x', {})).resolves.toEqual({ status: 'failed', message: 'Access sync failed.' });
  });
});
