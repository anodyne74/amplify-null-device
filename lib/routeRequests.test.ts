const mockRequestList = jest.fn();
const mockRequestUpdate = jest.fn();
const mockRequestCreate = jest.fn();
const mockRequestsByRoute = jest.fn();
const mockRequestGet = jest.fn();
const mockCustomerList = jest.fn();
const mockRouteList = jest.fn();
const mockSlotList = jest.fn();
const mockSlotCreate = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      RouteRequestRecord: {
        list: mockRequestList,
        get: mockRequestGet,
        update: mockRequestUpdate,
        create: mockRequestCreate,
        listRouteRequestRecordsByRoute: mockRequestsByRoute,
      },
      RouteRequestSlot: { list: mockSlotList, create: mockSlotCreate },
      Customer: { list: mockCustomerList },
      Route: { list: mockRouteList },
    },
  }),
}));

const mockUploadData = jest.fn();
jest.mock('aws-amplify/storage', () => ({
  uploadData: (...args: unknown[]) => mockUploadData(...args),
}));

jest.mock('./amplify-config', () => ({
  configureAmplify: jest.fn(),
  fetchUserId: jest.fn().mockResolvedValue('admin-sub'),
}));

const mockCallApi = jest.fn();
jest.mock('./apiClient', () => ({ callApi: (...args: unknown[]) => mockCallApi(...args) }));

import {
  attachNewRouteRequest,
  dismissRouteRequest,
  isManual,
  isSenderNotVerified,
  listLinkableRoutes,
  listRouteRequests,
  listRouteRequestsForRoute,
  openRouteRequestFile,
  recordManualRequest,
  requesterLabel,
  scheduleAttachmentIndex,
} from './routeRequests';

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
    mockRouteList.mockResolvedValue(page([]));

    const { data, error } = await listRouteRequests();

    expect(error).toBeUndefined();
    expect(data.map((row) => [row.request.id, row.suggestedCustomerName, row.senderNotVerified])).toEqual([
      ['new', null, false],
      ['old', 'Harcourts Epping', true],
    ]);
  });

  it("names the Route a linked record belongs to", async () => {
    mockRequestList.mockResolvedValue(page([{ id: 'm1', receivedAt: '2026-09-20T00:00:00Z', routeId: 'r1' }]));
    mockCustomerList.mockResolvedValue(page([]));
    mockRouteList.mockResolvedValue(page([{ id: 'r1', routeCode: 'W40-26-001' }]));

    expect((await listRouteRequests()).data[0].routeCode).toBe('W40-26-001');
  });

  it('reports an error rather than a short list when a page fails', async () => {
    mockRequestList.mockResolvedValue({ data: [], errors: [{ message: 'boom' }], nextToken: null });
    mockCustomerList.mockResolvedValue(page([]));
    mockRouteList.mockResolvedValue(page([]));
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

describe('isManual and requesterLabel', () => {
  const email = { source: 'email' as const, fromName: 'Ann Agent', fromAddress: 'ann@agency.example', loggedByStaff: false };

  it('names an email by its sender', () => {
    expect(isManual(email)).toBe(false);
    expect(requesterLabel(email)).toBe('Ann Agent <ann@agency.example>');
  });

  it('names a Logged-by-staff email by the requester entered for it, which makes it manual', () => {
    const staff = { ...email, fromName: 'Dave', fromAddress: 'dave@nulldevice.dev', loggedByStaff: true };
    expect(isManual(staff)).toBe(false);
    const entered = { ...staff, requesterName: 'Bob Buyer', requesterEmail: null };
    expect(isManual(entered)).toBe(true);
    expect(requesterLabel(entered)).toBe('Bob Buyer');
  });

  it('says a manual record with no requester was uploaded by an administrator', () => {
    expect(isManual({ source: 'manual' })).toBe(true);
    expect(requesterLabel({ source: 'manual', requesterName: null })).toBe('Uploaded by administrator');
    expect(requesterLabel({ source: 'manual', requesterName: 'Ann', requesterEmail: 'ann@agency.example' })).toBe('Ann <ann@agency.example>');
  });
});

describe('scheduleAttachmentIndex', () => {
  it('picks the first attached PDF, spreadsheet or CSV, skipping inline parts', () => {
    expect(
      scheduleAttachmentIndex([
        { key: 'k0', filename: 'logo.png', contentType: 'image/png', inline: true },
        { key: 'k1', filename: 'scan.pdf', contentType: 'application/pdf', inline: true },
        { key: 'k2', filename: 'notes.txt', contentType: 'text/plain', inline: false },
        { key: 'k3', filename: 'Tuesday.xlsx', contentType: 'application/octet-stream', inline: false },
      ])
    ).toBe(3);
  });

  it('finds none when there is no such file', () => {
    expect(scheduleAttachmentIndex([{ key: 'k0', filename: 'logo.png', contentType: 'image/png', inline: false }])).toBeNull();
    expect(scheduleAttachmentIndex(null)).toBeNull();
  });
});

describe('listRouteRequestsForRoute', () => {
  it("lists a Route's records in the order they were sent", async () => {
    mockRequestsByRoute.mockResolvedValue(
      page([
        { id: 'late', sentAt: '2026-09-22T00:00:00Z' },
        { id: 'early', sentAt: '2026-09-20T00:00:00Z' },
      ])
    );

    const { data } = await listRouteRequestsForRoute('r1');

    expect(mockRequestsByRoute).toHaveBeenCalledWith({ routeId: 'r1' }, expect.objectContaining({ limit: expect.any(Number) }));
    expect(data.map((row) => row.id)).toEqual(['early', 'late']);
  });
});

describe('listLinkableRoutes', () => {
  it('lists Routes newest first, marking those that already have their Route Request', async () => {
    mockRouteList.mockResolvedValue(
      page([
        { id: 'r1', routeCode: 'W39-26-001', customerId: 'c1', scheduledDate: '2026-09-22', createdAt: '2026-09-20T00:00:00Z' },
        { id: 'r2', routeCode: 'W40-26-001', customerId: 'c1', scheduledDate: null, createdAt: '2026-09-27T00:00:00Z' },
      ])
    );
    mockSlotList.mockResolvedValue(page([{ id: 'r1' }]));

    expect((await listLinkableRoutes()).data).toEqual([
      { id: 'r2', label: 'W40-26-001', customerId: 'c1', hasRouteRequest: false },
      { id: 'r1', label: 'W39-26-001 (2026-09-22)', customerId: 'c1', hasRouteRequest: true },
    ]);
  });
});

describe('recordManualRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores its files under the new record's requests/ path, then records it as manual by the signed-in administrator", async () => {
    mockUploadData.mockReturnValue({ result: Promise.resolve({}) });
    mockSlotCreate.mockResolvedValue({ data: {}, errors: null });
    mockRequestCreate.mockResolvedValue({ data: {}, errors: null });
    const file = new File(['abc'], 'Tuesday schedule.pdf', { type: 'application/pdf' });

    const result = await recordManualRequest({
      routeId: 'r1',
      role: 'request',
      requesterName: null,
      sentAt: '2026-09-28T23:00:00.000Z',
      files: [file],
      customerId: 'c1',
    });

    expect(result).toEqual({ ok: true });
    const created = mockRequestCreate.mock.calls[0][0];
    expect(mockUploadData).toHaveBeenCalledWith({
      path: `requests/${created.id}/0-Tuesday schedule.pdf`,
      data: file,
      options: { contentType: 'application/pdf' },
    });
    expect(created).toMatchObject({
      source: 'manual',
      status: 'linked',
      routeId: 'r1',
      role: 'request',
      requesterName: null,
      enteredBySub: 'admin-sub',
      suggestedCustomerId: 'c1',
      attachments: [{ key: `requests/${created.id}/0-Tuesday schedule.pdf`, filename: 'Tuesday schedule.pdf', contentType: 'application/pdf', size: 3, inline: false }],
    });
    expect(mockSlotCreate).toHaveBeenCalledWith({ id: 'r1', recordId: created.id });
  });

  it('records nothing when a file cannot be stored', async () => {
    mockUploadData.mockReturnValue({ result: Promise.reject(new Error('s3 down')) });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await recordManualRequest({
      routeId: null,
      role: 'request',
      requesterName: 'Ann',
      sentAt: '2026-09-28T23:00:00.000Z',
      files: [new File(['abc'], 'a.pdf')],
    });

    expect(result).toEqual({ ok: false, error: 'Could not record the Route Request.' });
    expect(mockRequestCreate).not.toHaveBeenCalled();
  });
});

describe('attachNewRouteRequest', () => {
  const base = { routeId: 'r1', customerId: 'c1', requestedAt: '2026-09-28T23:00:00.000Z' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadData.mockReturnValue({ result: Promise.resolve({}) });
    mockSlotCreate.mockResolvedValue({ data: {}, errors: null });
    mockRequestCreate.mockResolvedValue({ data: {}, errors: null });
    mockRequestUpdate.mockResolvedValue({ data: {}, errors: null });
  });

  it('links the inbox record the Route was created from as its Route Request', async () => {
    mockRequestGet.mockResolvedValue({ data: { id: 'e1', status: 'unlinked', loggedByStaff: true }, errors: null });

    const result = await attachNewRouteRequest({ ...base, fromRecordId: 'e1', requester: { name: 'Ann' }, file: null });

    expect(result).toEqual({ ok: true });
    expect(mockSlotCreate).toHaveBeenCalledWith({ id: 'r1', recordId: 'e1' });
    expect(mockRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', status: 'linked', routeId: 'r1', role: 'request', requesterName: 'Ann' })
    );
    expect(mockRequestCreate).not.toHaveBeenCalled();
  });

  it('records an uploaded Schedule as a manual Route Request, uploaded by administrator', async () => {
    const file = new File(['abc'], 'schedule.pdf', { type: 'application/pdf' });

    const result = await attachNewRouteRequest({ ...base, fromRecordId: null, requester: null, file });

    expect(result).toEqual({ ok: true });
    expect(mockRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', routeId: 'r1', role: 'request', requesterName: null, sentAt: base.requestedAt })
    );
  });

  it('records a note on its own as a manual Route Request', async () => {
    const result = await attachNewRouteRequest({ ...base, fromRecordId: null, requester: null, note: 'Phoned in', file: null });

    expect(result).toEqual({ ok: true });
    expect(mockRequestCreate).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual', note: 'Phoned in', attachments: [] }));
  });

  it('records nothing when there is neither a file nor a requester', async () => {
    const result = await attachNewRouteRequest({ ...base, fromRecordId: null, requester: null, file: null });

    expect(result).toEqual({ ok: true });
    expect(mockRequestCreate).not.toHaveBeenCalled();
    expect(mockSlotCreate).not.toHaveBeenCalled();
  });
});
