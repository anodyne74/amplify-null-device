const mockRequestList = jest.fn();
const mockRequestUpdate = jest.fn();
const mockCustomerList = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      RouteRequestEmail: { list: mockRequestList, update: mockRequestUpdate },
      Customer: { list: mockCustomerList },
    },
  }),
}));

jest.mock('./amplify-config', () => ({
  configureAmplify: jest.fn(),
  fetchUserId: jest.fn().mockResolvedValue('admin-sub'),
}));

const mockCallApi = jest.fn();
jest.mock('./apiClient', () => ({ callApi: (...args: unknown[]) => mockCallApi(...args) }));

import { dismissRouteRequest, isSenderNotVerified, listRouteRequests, openRouteRequestFile } from './routeRequests';

const page = (data: object[], nextToken: string | null = null) => ({ data, errors: null, nextToken });

describe('isSenderNotVerified', () => {
  it.each([
    [{ spfVerdict: 'PASS', dkimVerdict: 'PASS', dmarcVerdict: 'PASS' }, false],
    [{ spfVerdict: 'FAIL', dkimVerdict: 'PASS', dmarcVerdict: 'PASS' }, true],
    [{ spfVerdict: 'PASS', dkimVerdict: 'FAIL', dmarcVerdict: 'PASS' }, true],
    [{ spfVerdict: 'PASS', dkimVerdict: 'PASS', dmarcVerdict: 'FAIL' }, true],
    [{ spfVerdict: 'GRAY', dkimVerdict: 'PROCESSING_FAILED', dmarcVerdict: null }, false],
  ])('%j -> %s', (verdicts, expected) => {
    expect(isSenderNotVerified(verdicts)).toBe(expected);
  });
});

describe('listRouteRequests', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists every Route Request newest first, across pages, with its flag and suggested Customer name', async () => {
    mockRequestList
      .mockResolvedValueOnce(page([{ id: 'old', receivedAt: '2026-09-01T00:00:00Z', suggestedCustomerId: 'c1', dkimVerdict: 'FAIL' }], 't1'))
      .mockResolvedValueOnce(page([{ id: 'new', receivedAt: '2026-09-20T00:00:00Z', suggestedCustomerId: null }]));
    mockCustomerList.mockResolvedValue(page([{ id: 'c1', name: 'Ann', companyName: 'Harcourts Epping' }]));

    const { data, error } = await listRouteRequests();

    expect(error).toBeUndefined();
    expect(data.map((row) => [row.request.id, row.suggestedCustomerName, row.senderNotVerified])).toEqual([
      ['new', null, false],
      ['old', 'Harcourts Epping', true],
    ]);
  });

  it('reports an error rather than a short list when a page fails', async () => {
    mockRequestList.mockResolvedValue({ data: [], errors: [{ message: 'boom' }], nextToken: null });
    mockCustomerList.mockResolvedValue(page([]));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect((await listRouteRequests()).error).toMatch(/Could not load/);
  });
});

describe('dismissRouteRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks the Route Request dismissed with the reason, when and by whom -- it is never deleted', async () => {
    mockRequestUpdate.mockResolvedValue({ data: {}, errors: null });

    expect(await dismissRouteRequest('r1', '  Duplicate of Monday email ')).toEqual({ ok: true });
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      id: 'r1',
      status: 'dismissed',
      dismissedReason: 'Duplicate of Monday email',
      dismissedAt: expect.any(String),
      dismissedBySub: 'admin-sub',
    });
  });

  it('needs a reason', async () => {
    expect(await dismissRouteRequest('r1', '   ')).toEqual({ ok: false, error: 'Give a reason for dismissing it.' });
    expect(mockRequestUpdate).not.toHaveBeenCalled();
  });

  it('reports a failed update', async () => {
    mockRequestUpdate.mockResolvedValue({ data: null, errors: [{ message: 'nope' }] });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await dismissRouteRequest('r1', 'Spam')).toEqual({ ok: false, error: 'Could not dismiss the Route Request.' });
  });
});

describe('openRouteRequestFile', () => {
  it('asks the Route Request file API for a link', async () => {
    mockCallApi.mockResolvedValue({ url: 'https://signed.example/x' });

    expect(await openRouteRequestFile('r1', 'raw')).toBe('https://signed.example/x');
    expect(mockCallApi).toHaveBeenCalledWith('/api/route-requests/file', { requestId: 'r1', file: 'raw' });
  });
});
