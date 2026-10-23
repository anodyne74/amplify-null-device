const mockUpdate = jest.fn();
jest.mock('@/lib/data-client', () => ({ getDataClient: () => ({ models: { RouteRequestRecord: { update: mockUpdate } } }) }));
jest.mock('@/lib/amplify-config', () => ({ fetchUserId: jest.fn().mockResolvedValue('admin-sub') }));
const mockAudit = jest.fn();
jest.mock('@/lib/auditLog', () => ({ recordAudit: (...args: unknown[]) => mockAudit(...args) }));
const mockCreateStop = jest.fn();
const mockDeleteStop = jest.fn();
const mockResequence = jest.fn();
jest.mock('@/lib/routes', () => ({
  createStop: (...args: unknown[]) => mockCreateStop(...args),
  deleteStop: (...args: unknown[]) => mockDeleteStop(...args),
  resequenceStops: (...args: unknown[]) => mockResequence(...args),
}));
const mockLocate = jest.fn();
jest.mock('@/lib/stopLocation', () => ({ locateDraftStops: (...args: unknown[]) => mockLocate(...args) }));
const mockCustomer = jest.fn();
jest.mock('@/lib/customers', () => ({ getCustomer: (...args: unknown[]) => mockCustomer(...args) }));

import { acceptAmendmentAdd, acceptAmendmentDrop, canAcceptLines, decisionFor, LOAD_STARTED_MESSAGE, rejectAmendmentLine, withDecision } from '@/lib/amendmentLines';

const ROUTE = { id: 'route-1', customerId: 'cust-1', loadStartedAt: null, status: 'scheduled' };
const STOPS = [
  { sequence: 1, agent: 'Betty' },
  { sequence: 4, agent: 'Alex' },
  { sequence: 2, agent: null },
];
const ADDRESS = '3/13 Carlingford Road, Epping NSW 2121';

describe('amendment lines', () => {
  beforeEach(() => {
    for (const mock of [mockUpdate, mockAudit, mockCreateStop, mockLocate, mockCustomer, mockDeleteStop, mockResequence]) mock.mockReset();
    mockDeleteStop.mockResolvedValue(undefined);
    mockResequence.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue({ errors: null });
    mockAudit.mockResolvedValue({ ok: true });
    mockCreateStop.mockResolvedValue({ id: 'stop-new' });
    mockLocate.mockResolvedValue({ stops: [{ address: ADDRESS, latitude: -33.77, longitude: 151.08, addressSuburb: 'Epping' }], unpinned: 0, leftOut: [] });
    mockCustomer.mockResolvedValue({ defaultNumberOfSigns: 2 });
  });

  describe('accepting an add', () => {
    const accept = (overrides: object = {}) =>
      acceptAmendmentAdd({ recordId: 'rec-1', decisions: [], route: ROUTE, stops: STOPS, row: { agent: 'betty' }, address: ADDRESS, ...overrides });

    it('creates the Stop at the end of the order, keeps the decision and audits it', async () => {
      expect(await accept()).toEqual({ ok: true });

      expect(mockCreateStop).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 'route-1', customerId: 'cust-1', sequence: 5, address: ADDRESS, numberOfSigns: 2, agent: 'Betty' })
      );
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 'rec-1',
        amendmentDecisions: [expect.objectContaining({ change: 'add', address: ADDRESS, decision: 'accepted', decidedBySub: 'admin-sub', stopId: 'stop-new' })],
      });
      expect(mockAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'amendment_add_accepted', customerId: 'cust-1', resource: { type: 'stop', id: 'stop-new' } })
      );
    });

    it("uses the row's own number of signs over the Customer's default", async () => {
      await accept({ row: { numberOfSigns: 4 } });
      expect(mockCreateStop).toHaveBeenCalledWith(expect.objectContaining({ numberOfSigns: 4 }));
    });

    it('is refused once Load has started, writing nothing', async () => {
      expect(await accept({ route: { ...ROUTE, loadStartedAt: '2026-10-24T01:00:00Z' } })).toEqual({ ok: false, error: LOAD_STARTED_MESSAGE });
      expect(await accept({ route: { ...ROUTE, status: 'completed' } })).toEqual({ ok: false, error: LOAD_STARTED_MESSAGE });
      expect(mockCreateStop).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('adds nothing for an address with no findable suburb', async () => {
      mockLocate.mockResolvedValue({ stops: [], unpinned: 0, leftOut: [ADDRESS] });
      const result = await accept();
      expect(result.ok).toBe(false);
      expect(mockCreateStop).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('warns when the Stop was added without a pin', async () => {
      mockLocate.mockResolvedValue({ stops: [{ address: ADDRESS }], unpinned: 1, leftOut: [] });
      const result = await accept();
      expect(result).toEqual({ ok: true, warning: expect.stringMatching(/without a pin/) });
    });

    it('reports a failed Stop write and keeps no decision', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockCreateStop.mockRejectedValue(new Error('boom'));
      expect((await accept()).ok).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('says so when the Stop was added but the decision or audit could not be saved', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockUpdate.mockResolvedValue({ errors: [{ message: 'no' }] });
      expect(await accept()).toEqual({ ok: true, warning: expect.stringMatching(/the decision could not be saved/) });
      mockUpdate.mockResolvedValue({ errors: null });
      mockAudit.mockResolvedValue({ ok: false, errors: [] });
      expect(await accept()).toEqual({ ok: true, warning: expect.stringMatching(/the audit entry could not be saved/) });
    });

    it('replaces an earlier rejection of the same line', async () => {
      const earlier = { change: 'add', address: ADDRESS, decision: 'rejected', decidedAt: 't', decidedBySub: 's' };
      await accept({ decisions: [earlier] });
      expect(mockUpdate.mock.calls[0][0].amendmentDecisions).toHaveLength(1);
      expect(mockUpdate.mock.calls[0][0].amendmentDecisions[0].decision).toBe('accepted');
    });
  });

  describe('accepting a drop', () => {
    const ROUTE_STOPS = [
      { id: 's3', sequence: 3 },
      { id: 's1', sequence: 1 },
      { id: 's2', sequence: 2 },
    ];
    const drop = (overrides: object = {}) =>
      acceptAmendmentDrop({
        recordId: 'rec-1',
        decisions: [],
        route: ROUTE,
        stops: ROUTE_STOPS,
        stop: { id: 's2', address: '5 Other Street, Eastwood NSW 2122' },
        address: '5 Other Street, Eastwood',
        ...overrides,
      });

    it('deletes the Stop, renumbers the rest, keeps the decision and audits which Stop went', async () => {
      expect(await drop()).toEqual({ ok: true });

      expect(mockDeleteStop).toHaveBeenCalledWith('s2');
      expect(mockResequence).toHaveBeenCalledWith(['s1', 's3']);
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 'rec-1',
        amendmentDecisions: [expect.objectContaining({ change: 'drop', address: '5 Other Street, Eastwood', decision: 'accepted', stopId: 's2' })],
      });
      expect(mockAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'amendment_drop_accepted',
          resource: { type: 'stop', id: 's2' },
          details: { recordId: 'rec-1', address: '5 Other Street, Eastwood NSW 2122' },
        })
      );
    });

    it('is refused once Load has started, deleting nothing', async () => {
      expect(await drop({ route: { ...ROUTE, loadStartedAt: '2026-10-24T01:00:00Z' } })).toEqual({ ok: false, error: LOAD_STARTED_MESSAGE });
      expect(mockDeleteStop).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('keeps the Stop and records nothing when the delete fails', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockDeleteStop.mockRejectedValue(new Error('no'));
      expect((await drop()).ok).toBe(false);
      expect(mockResequence).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('still records the drop when renumbering fails, and says the order was not saved', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockResequence.mockRejectedValue(new Error('no'));
      expect(await drop()).toEqual({ ok: true, warning: expect.stringMatching(/order of the other Stops could not be saved/) });
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockAudit).toHaveBeenCalled();
    });

    it('says so when the Stop was taken off but the decision could not be saved', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockUpdate.mockResolvedValue({ errors: [{ message: 'no' }] });
      expect(await drop()).toEqual({ ok: true, warning: expect.stringMatching(/the decision could not be saved/) });
    });

    it('keeps a decision on an add of the same address separate from the drop', async () => {
      const add = { change: 'add', address: '5 Other Street, Eastwood', decision: 'rejected', decidedAt: 't', decidedBySub: 's' };
      await drop({ decisions: [add] });
      expect(mockUpdate.mock.calls[0][0].amendmentDecisions).toHaveLength(2);
    });
  });

  describe('rejecting', () => {
    it('keeps the decision and creates nothing, even after Load has started', async () => {
      expect(await rejectAmendmentLine({ recordId: 'rec-1', decisions: null, change: 'add', address: ADDRESS })).toEqual({ ok: true });
      expect(mockUpdate).toHaveBeenCalledWith({ id: 'rec-1', amendmentDecisions: [expect.objectContaining({ decision: 'rejected', address: ADDRESS })] });
      expect(mockCreateStop).not.toHaveBeenCalled();
    });

    it('reports a decision that could not be saved', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockUpdate.mockResolvedValue({ errors: [{ message: 'no' }] });
      expect((await rejectAmendmentLine({ recordId: 'rec-1', decisions: [], change: 'add', address: ADDRESS })).ok).toBe(false);
    });
  });

  it('finds a decision by line, ignoring case and spacing, and keeps the others when replacing one', () => {
    const a = { change: 'add', address: '3 Foo St', decision: 'rejected', decidedAt: 't', decidedBySub: 's' };
    const b = { change: 'drop', address: '3 Foo St', decision: 'rejected', decidedAt: 't', decidedBySub: 's' };
    expect(decisionFor([a, null, b], 'add', ' 3 FOO ST ')).toBe(a);
    expect(decisionFor(undefined, 'add', '3 Foo St')).toBeUndefined();
    expect(withDecision([a, b], { ...a, decision: 'accepted' })).toEqual([b, { ...a, decision: 'accepted' }]);
  });

  it('allows acceptance only before Load starts', () => {
    expect(canAcceptLines({ loadStartedAt: null, status: 'scheduled' })).toBe(true);
    expect(canAcceptLines({ loadStartedAt: 'x', status: 'in_progress' })).toBe(false);
    expect(canAcceptLines({ loadStartedAt: null, status: 'archived' })).toBe(false);
  });
});
