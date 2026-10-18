/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: jest.fn(() => ({ verify: verifyMock })) },
}));

const records: Record<string, any>[] = [];
const updateMock = jest.fn(async ({ id, ...fields }: any) => {
  Object.assign(records.find((row) => row.id === id)!, fields);
  return { data: {} };
});
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => ({
    models: {
      RouteRequestRecord: {
        get: async ({ id }: { id: string }) => ({ data: records.find((row) => row.id === id) ?? null }),
        update: updateMock,
      },
    },
  }),
}));

const readFileMock = jest.fn();
jest.mock('@/lib/server/reportStorage', () => ({ readRouteRequestFile: (key: string) => readFileMock(key) }));
const pdfTextMock = jest.fn();
jest.mock('@/lib/server/pdfLayoutText', () => ({ extractPdfLayoutText: (data: Uint8Array) => pdfTextMock(data) }));
const askMock = jest.fn();
jest.mock('@/lib/server/scheduleModel', () => ({ askScheduleModel: (input: unknown) => askMock(input) }));

import { POST } from '@/app/api/route-requests/read-schedule/route';

const ADMIN = { sub: 'sub-admin', 'cognito:groups': ['administrator'] };
const OPERATOR = { sub: 'sub-operator', 'cognito:groups': ['operator'] };
const CUSTOMER = { sub: 'sub-owner', 'cognito:groups': ['customer'] };

async function call(caller: object | null, body: unknown) {
  verifyMock.mockResolvedValue(caller);
  const headers = new Headers(caller ? { authorization: 'Bearer token-value' } : {});
  const response = await POST({ headers, json: async () => body } as any);
  return { status: response.status as number, body: await response.json() };
}

const SHEET = 'TIME  Total  PROPERTY  AGENT\n9:15 - 9:45  5  1 Example Street, Epping  Alex';
const MODEL_ANSWER = JSON.stringify({
  sheetDate: '10th October 2026',
  rows: [{ address: '1 Example Street, Epping', numberOfSigns: 5, agent: 'Alex', timeSlot: '9:15 - 9:45' }],
  instructions: [{ text: 'Use the side street', address: '1 Example Street, Epping', source: 'email' }],
  statedTotals: { signs: 5, agents: [{ agent: 'Alex', signs: 5 }] },
  warnings: [],
});

describe('POST /api/route-requests/read-schedule', () => {
  beforeEach(() => {
    records.splice(0, records.length, {
      id: 'ses-msg-1',
      bodyText: 'Schedule attached',
      attachments: [
        { key: 'requests/ses-msg-1/0-logo.png', filename: 'logo.png', contentType: 'image/png', inline: true },
        { key: 'requests/ses-msg-1/1-schedule.pdf', filename: 'schedule.pdf', contentType: 'application/pdf' },
      ],
    });
    for (const mock of [updateMock, readFileMock, pdfTextMock, askMock]) mock.mockClear();
    readFileMock.mockResolvedValue(new Uint8Array([1]));
    pdfTextMock.mockResolvedValue(SHEET);
    askMock.mockResolvedValue(MODEL_ANSWER);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads the Schedule, stores the reading on the Route Request and returns it', async () => {
    const { status, body } = await call(ADMIN, { requestId: 'ses-msg-1' });

    expect(status).toBe(200);
    expect(body.cached).toBe(false);
    expect(body.reading).toMatchObject({
      readBySub: 'sub-admin',
      attachmentIndex: 1,
      sheetDate: '10th October 2026',
      rows: [{ address: '1 Example Street, Epping', numberOfSigns: 5, agent: 'Alex', timeSlot: '9:15 - 9:45' }],
      instructions: [{ text: 'Use the side street', address: '1 Example Street, Epping', source: 'email' }],
      statedTotals: { signs: 5, agents: [{ agent: 'Alex', signs: 5 }] },
    });
    expect(readFileMock).toHaveBeenCalledWith('requests/ses-msg-1/1-schedule.pdf');
    expect(askMock.mock.calls[0][0].prompt).toContain(SHEET);
    expect(askMock.mock.calls[0][0].prompt).toContain('Schedule attached');
    expect(updateMock).toHaveBeenCalledWith({ id: 'ses-msg-1', scheduleReading: body.reading });
  });

  it('returns the stored reading on the next ask, with no new model call', async () => {
    await call(ADMIN, { requestId: 'ses-msg-1' });
    askMock.mockClear();

    const again = await call(ADMIN, { requestId: 'ses-msg-1' });
    expect(again.body.cached).toBe(true);
    expect(again.body.reading.rows).toHaveLength(1);
    expect(askMock).not.toHaveBeenCalled();
  });

  it('reads again when asked to', async () => {
    await call(ADMIN, { requestId: 'ses-msg-1' });
    askMock.mockClear();
    expect((await call(ADMIN, { requestId: 'ses-msg-1', force: true })).body.cached).toBe(false);
    expect(askMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a scan to the model', async () => {
    pdfTextMock.mockResolvedValue('');
    const { status, body } = await call(ADMIN, { requestId: 'ses-msg-1' });
    expect(status).toBe(422);
    expect(body.error).toMatch(/no text to read/);
    expect(askMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('says so when there is no Schedule, or it is a kind it cannot read', async () => {
    records[0].attachments = [{ key: 'k', filename: 'logo.png', contentType: 'image/png', inline: true }];
    expect((await call(ADMIN, { requestId: 'ses-msg-1' })).status).toBe(422);

    records[0].attachments = [{ key: 'k', filename: 'sheet.docx', contentType: 'application/msword' }];
    const word = await call(ADMIN, { requestId: 'ses-msg-1', attachmentIndex: 0 });
    expect(word.status).toBe(422);
    expect(word.body.error).toMatch(/not a PDF or text file/);
    expect(askMock).not.toHaveBeenCalled();
  });

  it('keeps nothing when the model answers badly', async () => {
    askMock.mockResolvedValue('Sorry, I cannot help');
    expect((await call(ADMIN, { requestId: 'ses-msg-1' })).status).toBe(502);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('reports a missing Route Request and a missing id', async () => {
    expect((await call(ADMIN, { requestId: 'nope' })).status).toBe(404);
    expect((await call(ADMIN, {})).status).toBe(400);
  });

  it('refuses operators, customers and a request with no session before reading anything', async () => {
    expect((await call(OPERATOR, { requestId: 'ses-msg-1' })).status).toBe(403);
    expect((await call(CUSTOMER, { requestId: 'ses-msg-1' })).status).toBe(403);
    expect((await call(null, { requestId: 'ses-msg-1' })).status).toBe(401);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(askMock).not.toHaveBeenCalled();
  });
});
