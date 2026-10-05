const mockCallApi = jest.fn();
jest.mock('@/lib/apiClient', () => ({ callApi: (...args: unknown[]) => mockCallApi(...args) }));

import { requestMissingSignsReport } from './requestMissingSignsReport';

describe('requestMissingSignsReport (#468)', () => {
  beforeEach(() => jest.clearAllMocks());

  it("asks the server for the Route's report", async () => {
    mockCallApi.mockResolvedValue({ outcome: 'sent' });

    await requestMissingSignsReport('route-1');

    expect(mockCallApi).toHaveBeenCalledWith('/api/missing-signs-report', { routeId: 'route-1' });
  });

  it('only logs a failure, so Finalise is never held up by it', async () => {
    mockCallApi.mockRejectedValue(new Error('offline'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(requestMissingSignsReport('route-1')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
