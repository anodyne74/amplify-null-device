import {
  linkRouteRequestRecord,
  recordManualRouteRequest,
  unlinkRecordsOfDeletedRoute,
  unlinkRouteRequestRecord,
  type LinkClient,
} from './routeRequestLinks';

type Row = Record<string, unknown> & { id: string };

/**
 * An in-memory stand-in for the data client. Like AppSync's create, a create
 * fails when the id already exists, and every call yields first, so two links
 * started together really do interleave. Like AppSync's update, setting a field
 * to null is refused unless the caller may delete the model -- administrators
 * may delete RouteRequestRecord for just this reason (#401).
 */
function fakeClient(records: Row[] = [], slots: Row[] = [], { canDeleteRecords = true } = {}) {
  const tables = { RouteRequestRecord: new Map(records.map((row) => [row.id, { ...row }])), RouteRequestSlot: new Map(slots.map((row) => [row.id, { ...row }])) };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const failures = { recordUpdate: false, recordCreate: false, slotDelete: false };

  function model(name: keyof typeof tables) {
    const table = tables[name];
    return {
      get: async ({ id }: { id: string }) => {
        await tick();
        return { data: table.get(id) ?? null, errors: null };
      },
      create: async (input: Row) => {
        await tick();
        if (name === 'RouteRequestRecord' && failures.recordCreate) return { data: null, errors: [{ message: 'create failed' }] };
        if (table.has(input.id)) return { data: null, errors: [{ errorType: 'DynamoDB:ConditionalCheckFailedException' }] };
        table.set(input.id, { ...input });
        return { data: input, errors: null };
      },
      update: async (input: Row) => {
        await tick();
        if (failures.recordUpdate) return { data: null, errors: [{ message: 'update failed' }] };
        const nulled = Object.keys(input).filter((key) => input[key] === null);
        if (name === 'RouteRequestRecord' && !canDeleteRecords && nulled.length > 0) {
          return { data: null, errors: [{ errorType: 'Unauthorized', message: `Unauthorized on [${nulled.join(', ')}]` }] };
        }
        const row = { ...table.get(input.id)!, ...input };
        table.set(input.id, row);
        return { data: row, errors: null };
      },
      delete: async ({ id }: { id: string }) => {
        await tick();
        if (failures.slotDelete) return { data: null, errors: [{ message: 'delete failed' }] };
        table.delete(id);
        return { data: { id }, errors: null };
      },
    };
  }

  const client = {
    models: {
      RouteRequestRecord: {
        ...model('RouteRequestRecord'),
        listRouteRequestRecordsByRoute: async ({ routeId }: { routeId: string }) => ({
          data: [...tables.RouteRequestRecord.values()].filter((row) => row.routeId === routeId),
          errors: null,
          nextToken: null,
        }),
      },
      RouteRequestSlot: model('RouteRequestSlot'),
    },
  } as unknown as LinkClient;

  return { client, tables, failures };
}

const NOW = '2026-09-29T01:00:00.000Z';
const email = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  source: 'email',
  status: 'unlinked',
  sentAt: '2026-09-28T22:00:00.000Z',
  loggedByStaff: false,
  ...extra,
});

describe('linkRouteRequestRecord', () => {
  it('links an email as a Route’s Route Request and holds the Route’s slot', async () => {
    const { client, tables } = fakeClient([email('m1')]);

    await expect(
      linkRouteRequestRecord(client, { recordId: 'm1', routeId: 'r1', role: 'request', bySub: 'admin', now: NOW })
    ).resolves.toEqual({ ok: true });

    expect(tables.RouteRequestRecord.get('m1')).toMatchObject({
      status: 'linked',
      routeId: 'r1',
      role: 'request',
      linkedAt: NOW,
      linkedBySub: 'admin',
      unlinkedNote: null,
    });
    expect(tables.RouteRequestSlot.get('r1')).toMatchObject({ recordId: 'm1' });
  });

  it('refuses a second Route Request for a Route', async () => {
    const { client, tables } = fakeClient([email('m1'), email('m2')]);
    await linkRouteRequestRecord(client, { recordId: 'm1', routeId: 'r1', role: 'request', bySub: 'admin', now: NOW });

    await expect(
      linkRouteRequestRecord(client, { recordId: 'm2', routeId: 'r1', role: 'request', bySub: 'admin', now: NOW })
    ).resolves.toEqual({ ok: false, error: 'That Route already has a Route Request.' });
    expect(tables.RouteRequestRecord.get('m2')).toMatchObject({ status: 'unlinked' });
  });

  it('lets only one of two links made at the same moment become the Route Request', async () => {
    const { client, tables } = fakeClient([email('m1'), email('m2')]);

    const results = await Promise.all(
      ['m1', 'm2'].map((recordId) => linkRouteRequestRecord(client, { recordId, routeId: 'r1', role: 'request', bySub: 'admin', now: NOW }))
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const linked = [...tables.RouteRequestRecord.values()].filter((row) => row.status === 'linked');
    expect(linked).toHaveLength(1);
    expect(tables.RouteRequestSlot.get('r1')).toMatchObject({ recordId: linked[0].id });
  });

  it('links any number of Amendments to a Route without a slot', async () => {
    const { client, tables } = fakeClient([email('m1'), email('m2')]);

    for (const recordId of ['m1', 'm2']) {
      await expect(
        linkRouteRequestRecord(client, { recordId, routeId: 'r1', role: 'amendment', bySub: 'admin', now: NOW })
      ).resolves.toEqual({ ok: true });
    }
    expect(tables.RouteRequestRecord.get('m2')).toMatchObject({ status: 'linked', role: 'amendment', routeId: 'r1' });
    expect(tables.RouteRequestSlot.size).toBe(0);
  });

  it('requires the real requester for an email Logged by staff, and records who entered it', async () => {
    const { client, tables } = fakeClient([email('m1', { loggedByStaff: true })]);

    await expect(
      linkRouteRequestRecord(client, { recordId: 'm1', routeId: 'r1', role: 'request', bySub: 'admin', now: NOW })
    ).resolves.toEqual({ ok: false, error: 'Enter the name of the person who asked for it.' });
    expect(tables.RouteRequestSlot.size).toBe(0);

    await expect(
      linkRouteRequestRecord(client, {
        recordId: 'm1',
        routeId: 'r1',
        role: 'request',
        requester: { name: ' Ann Agent ', email: ' ann@agency.example ' },
        bySub: 'admin',
        now: NOW,
      })
    ).resolves.toEqual({ ok: true });
    expect(tables.RouteRequestRecord.get('m1')).toMatchObject({
      requesterName: 'Ann Agent',
      requesterEmail: 'ann@agency.example',
      enteredBySub: 'admin',
    });
  });

  it('refuses a record that is already linked', async () => {
    const { client } = fakeClient([email('m1', { status: 'linked', routeId: 'r9', role: 'amendment' })]);

    await expect(
      linkRouteRequestRecord(client, { recordId: 'm1', routeId: 'r1', role: 'amendment', bySub: 'admin', now: NOW })
    ).resolves.toEqual({ ok: false, error: 'It is already linked to a Route. Unlink it first.' });
  });

  it('gives the slot back when the record cannot be updated', async () => {
    const { client, tables, failures } = fakeClient([email('m1')]);
    failures.recordUpdate = true;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await linkRouteRequestRecord(client, { recordId: 'm1', routeId: 'r1', role: 'request', bySub: 'admin', now: NOW });

    expect(result.ok).toBe(false);
    expect(tables.RouteRequestSlot.size).toBe(0);
  });

  // Linking and unlinking clear fields, so both need administrators to hold
  // delete on RouteRequestRecord in amplify/data/resource.ts (#401).
  it.each(['request', 'amendment'] as const)('can only link as a %s while nulls are allowed', async (role) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const refused = fakeClient([email('m1')], [], { canDeleteRecords: false });
    await expect(linkRouteRequestRecord(refused.client, { recordId: 'm1', routeId: 'r1', role, bySub: 'admin', now: NOW })).resolves.toEqual({
      ok: false,
      error: 'Could not link it to the Route.',
    });
    expect(refused.tables.RouteRequestSlot.size).toBe(0);

    const allowed = fakeClient([email('m1')]);
    await expect(linkRouteRequestRecord(allowed.client, { recordId: 'm1', routeId: 'r1', role, bySub: 'admin', now: NOW })).resolves.toEqual({ ok: true });
  });
});

describe('unlinkRouteRequestRecord', () => {
  it('returns a Route Request to the inbox and frees its Route’s slot', async () => {
    const { client, tables } = fakeClient(
      [email('m1', { status: 'linked', routeId: 'r1', role: 'request', linkedAt: NOW, linkedBySub: 'admin' })],
      [{ id: 'r1', recordId: 'm1' }]
    );

    await expect(unlinkRouteRequestRecord(client, 'm1')).resolves.toEqual({ ok: true });

    expect(tables.RouteRequestRecord.get('m1')).toMatchObject({ status: 'unlinked', routeId: null, role: null, linkedAt: null });
    expect(tables.RouteRequestSlot.size).toBe(0);
  });

  it('leaves another record’s slot alone when unlinking an Amendment', async () => {
    const { client, tables } = fakeClient(
      [email('m1', { status: 'linked', routeId: 'r1', role: 'request' }), email('m2', { status: 'linked', routeId: 'r1', role: 'amendment' })],
      [{ id: 'r1', recordId: 'm1' }]
    );

    await unlinkRouteRequestRecord(client, 'm2');

    expect(tables.RouteRequestSlot.get('r1')).toMatchObject({ recordId: 'm1' });
  });
});

describe('recordManualRouteRequest', () => {
  it('records a manual Route Request on a Route with who asked, when, a note, files and who entered it', async () => {
    const { client, tables } = fakeClient();
    const attachments = [{ key: 'requests/man-1/0-schedule.pdf', filename: 'schedule.pdf', contentType: 'application/pdf', size: 10, inline: false }];

    await expect(
      recordManualRouteRequest(client, {
        id: 'man-1',
        routeId: 'r1',
        role: 'request',
        requesterName: 'Ann Agent',
        requesterEmail: null,
        sentAt: '2026-09-28T23:00:00.000Z',
        note: 'Rang on Monday',
        attachments,
        bySub: 'admin',
        now: NOW,
      })
    ).resolves.toEqual({ ok: true });

    expect(tables.RouteRequestRecord.get('man-1')).toMatchObject({
      source: 'manual',
      status: 'linked',
      routeId: 'r1',
      role: 'request',
      requesterName: 'Ann Agent',
      sentAt: '2026-09-28T23:00:00.000Z',
      receivedAt: NOW,
      note: 'Rang on Monday',
      attachments,
      enteredBySub: 'admin',
      linkedBySub: 'admin',
    });
    expect(tables.RouteRequestSlot.get('r1')).toMatchObject({ recordId: 'man-1' });
  });

  it('refuses a manual Route Request for a Route that already has one, and records nothing', async () => {
    const { client, tables } = fakeClient([], [{ id: 'r1', recordId: 'm1' }]);

    const result = await recordManualRouteRequest(client, {
      id: 'man-1',
      routeId: 'r1',
      role: 'request',
      requesterName: 'Ann Agent',
      requesterEmail: null,
      sentAt: NOW,
      note: null,
      attachments: [],
      bySub: 'admin',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, error: 'That Route already has a Route Request.' });
    expect(tables.RouteRequestRecord.size).toBe(0);
  });

  it('gives the slot back when the record cannot be created', async () => {
    const { client, tables, failures } = fakeClient();
    failures.recordCreate = true;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await recordManualRouteRequest(client, {
      id: 'man-1',
      routeId: 'r1',
      role: 'request',
      requesterName: null,
      requesterEmail: null,
      sentAt: NOW,
      note: null,
      attachments: [],
      bySub: 'admin',
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(tables.RouteRequestSlot.size).toBe(0);
  });
});

describe('unlinkRecordsOfDeletedRoute', () => {
  it('returns every record of a deleted Route to the inbox with a note naming it, and frees the slot', async () => {
    const { client, tables } = fakeClient(
      [
        email('m1', { status: 'linked', routeId: 'r1', role: 'request' }),
        email('m2', { status: 'linked', routeId: 'r1', role: 'amendment' }),
        email('m3', { status: 'linked', routeId: 'r2', role: 'request' }),
      ],
      [{ id: 'r1', recordId: 'm1' }, { id: 'r2', recordId: 'm3' }]
    );

    await expect(unlinkRecordsOfDeletedRoute(client, 'r1', 'W40-26-001')).resolves.toEqual([]);

    for (const id of ['m1', 'm2']) {
      expect(tables.RouteRequestRecord.get(id)).toMatchObject({
        status: 'unlinked',
        routeId: null,
        role: null,
        unlinkedNote: 'Its Route W40-26-001 was deleted.',
      });
    }
    expect(tables.RouteRequestRecord.get('m3')).toMatchObject({ status: 'linked', routeId: 'r2' });
    expect([...tables.RouteRequestSlot.keys()]).toEqual(['r2']);
  });
});
