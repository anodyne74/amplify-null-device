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
jest.mock('@/lib/server/pdfLayoutText', () => ({ extractPdfLayoutPages: (data: Uint8Array) => pdfTextMock(data) }));
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
    pdfTextMock.mockResolvedValue([SHEET]);
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

  describe('a sheet of several pages', () => {
    const PAGE_ONE = 'TIME  Total  PROPERTY  AGENT\n9:15  5  1 Example Street, Epping  Alex';
    const PAGE_TWO = '10:00  2  7 Sample Road, Eastwood  Betty\nTotal 7';
    const answer = (fields: object) => JSON.stringify({ rows: [], instructions: [], warnings: [], ...fields });

    beforeEach(() => {
      pdfTextMock.mockResolvedValue([PAGE_ONE, PAGE_TWO]);
      askMock.mockReset();
      askMock
        .mockResolvedValueOnce(answer({ sheetDate: '10th October 2026', rows: [{ address: '1 Example Street, Epping', numberOfSigns: 5, agent: 'Alex' }], instructions: [{ text: 'Use the side street', source: 'email' }] }))
        .mockResolvedValueOnce(answer({ rows: [{ address: '7 Sample Road, Eastwood', numberOfSigns: 2, agent: 'Betty' }], statedTotals: { signs: 7, agents: [] } }));
    });

    it('reads one page a call, storing the rows so far with how far it got', async () => {
      const first = await call(ADMIN, { requestId: 'ses-msg-1' });

      expect(first.status).toBe(200);
      expect(askMock).toHaveBeenCalledTimes(1);
      expect(askMock.mock.calls[0][0].prompt).toContain(PAGE_ONE);
      expect(askMock.mock.calls[0][0].prompt).not.toContain(PAGE_TWO);
      expect(askMock.mock.calls[0][0].prompt).toContain('page="1" of="2"');
      expect(first.body.reading.progress).toEqual({ pagesRead: 1, pageCount: 2 });
      expect(first.body.reading.rows).toHaveLength(1);
      expect(records[0].scheduleReading.progress).toEqual({ pagesRead: 1, pageCount: 2 });
    });

    it('carries on from the stored pages when asked again, and finishes with no progress', async () => {
      await call(ADMIN, { requestId: 'ses-msg-1' });
      const second = await call(ADMIN, { requestId: 'ses-msg-1' });

      expect(second.body.cached).toBe(false);
      expect(askMock).toHaveBeenCalledTimes(2);
      expect(askMock.mock.calls[1][0].prompt).toContain(PAGE_TWO);
      expect(askMock.mock.calls[1][0].prompt).toContain('page="2" of="2"');
      expect(askMock.mock.calls[1][0].prompt).not.toContain('Schedule attached');
      expect(second.body.reading.progress).toBeUndefined();
      expect(second.body.reading.sheetDate).toBe('10th October 2026');
      expect(second.body.reading.rows.map((row: { address: string }) => row.address)).toEqual(['1 Example Street, Epping', '7 Sample Road, Eastwood']);
      expect(second.body.reading.instructions).toEqual([{ text: 'Use the side street', source: 'email' }]);
      expect(second.body.reading.statedTotals.signs).toBe(7);

      // A finished reading is returned as it is.
      askMock.mockClear();
      expect((await call(ADMIN, { requestId: 'ses-msg-1' })).body.cached).toBe(true);
      expect(askMock).not.toHaveBeenCalled();
    });

    it('keeps the pages read when a later page fails, and retries that page', async () => {
      await call(ADMIN, { requestId: 'ses-msg-1' });
      askMock.mockReset();
      askMock.mockRejectedValueOnce(new Error('The model ran out of room')).mockResolvedValueOnce(answer({ rows: [{ address: '7 Sample Road, Eastwood' }] }));

      expect((await call(ADMIN, { requestId: 'ses-msg-1' })).status).toBe(502);
      expect(records[0].scheduleReading.progress).toEqual({ pagesRead: 1, pageCount: 2 });

      const retry = await call(ADMIN, { requestId: 'ses-msg-1' });
      expect(retry.body.reading.rows).toHaveLength(2);
      expect(askMock.mock.calls[1][0].prompt).toContain(PAGE_TWO);
    });

    it('starts over when forced, or when the stored pages are of a different file', async () => {
      await call(ADMIN, { requestId: 'ses-msg-1' });
      askMock.mockClear();
      askMock.mockResolvedValue(answer({ rows: [{ address: '1 Example Street, Epping' }] }));

      const forced = await call(ADMIN, { requestId: 'ses-msg-1', force: true });
      expect(askMock.mock.calls[0][0].prompt).toContain(PAGE_ONE);
      expect(forced.body.reading.progress).toEqual({ pagesRead: 1, pageCount: 2 });

      pdfTextMock.mockResolvedValue([PAGE_ONE, PAGE_TWO, 'page three']);
      await call(ADMIN, { requestId: 'ses-msg-1' });
      expect(askMock.mock.calls[1][0].prompt).toContain(PAGE_ONE);
    });
  });

  it('does not send a scan to the model', async () => {
    pdfTextMock.mockResolvedValue([]);
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

  it('reads a Route Amendment sent as a sentence from the email alone', async () => {
    records[0] = { id: 'amend-1', role: 'amendment', bodyText: 'Please add 3/13 Carlingford Road and 15/13 Carlingford Road to your list.', attachments: [] };
    askMock.mockResolvedValue(
      JSON.stringify({
        rows: [
          { address: '3/13 Carlingford Road', change: 'add' },
          { address: '15/13 Carlingford Road', change: 'add' },
        ],
        instructions: [],
        warnings: [],
      })
    );
    const { status, body } = await call(ADMIN, { requestId: 'amend-1' });
    expect(status).toBe(200);
    expect(body.reading.rows.map((row: any) => [row.address, row.change])).toEqual([
      ['3/13 Carlingford Road', 'add'],
      ['15/13 Carlingford Road', 'add'],
    ]);
    expect(body.reading.attachmentIndex).toBe(-1);
    expect(readFileMock).not.toHaveBeenCalled();
    const sent = askMock.mock.calls[0][0];
    expect(sent.system).toMatch(/Route Amendment/);
    expect(sent.prompt).toContain('<sheet>(none)</sheet>');
    expect(sent.prompt).toContain('Carlingford Road');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'amend-1' }));
  });

  it('reads a Route Amendment that has a Schedule from the Schedule, with the Amendment prompt', async () => {
    records[0].role = 'amendment';
    askMock.mockResolvedValue(MODEL_ANSWER);
    expect((await call(ADMIN, { requestId: 'ses-msg-1' })).status).toBe(200);
    expect(askMock.mock.calls[0][0].system).toMatch(/Route Amendment/);
    expect(askMock.mock.calls[0][0].prompt).toContain('Example Street');
  });

  it('reads an Amendment recorded by hand from its note', async () => {
    records[0] = { id: 'amend-2', role: 'amendment', source: 'manual', note: 'Phone call: add 2 Smith Street, Epping', attachments: [] };
    askMock.mockResolvedValue(JSON.stringify({ rows: [{ address: '2 Smith Street, Epping', change: 'add' }], instructions: [], warnings: [] }));
    expect((await call(ADMIN, { requestId: 'amend-2' })).status).toBe(200);
    expect(askMock.mock.calls[0][0].prompt).toContain('Phone call');
  });

  it('refuses to read an Amendment with no text, and a Route Request with no Schedule still needs one', async () => {
    records[0] = { id: 'amend-3', role: 'amendment', bodyText: 'ok', attachments: [] };
    expect((await call(ADMIN, { requestId: 'amend-3' })).status).toBe(422);
    records[0] = { id: 'req-1', role: 'request', bodyText: 'Please add things to the list', attachments: [] };
    expect((await call(ADMIN, { requestId: 'req-1' })).status).toBe(422);
    expect(askMock).not.toHaveBeenCalled();
  });

  it('refuses operators, customers and a request with no session before reading anything', async () => {
    expect((await call(OPERATOR, { requestId: 'ses-msg-1' })).status).toBe(403);
    expect((await call(CUSTOMER, { requestId: 'ses-msg-1' })).status).toBe(403);
    expect((await call(null, { requestId: 'ses-msg-1' })).status).toBe(401);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(askMock).not.toHaveBeenCalled();
  });
});
