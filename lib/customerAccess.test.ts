import { syncCustomerAccess } from './customerAccess';

type Row = { id: string } & Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * In-memory stand-in for an Amplify data client: `list` applies `eq` filters
 * and pages one row at a time (so every read must follow nextToken), `update`
 * merges into the stored row.
 */
function fakeClient(tables: Tables) {
  const failUpdates = new Set<string>();
  const listErrors: Record<string, unknown[]> = {};

  const models = Object.fromEntries(
    [
      'Customer',
      'CustomerUser',
      'Route',
      'Stop',
      'Invoice',
      'LineItem',
      'PaymentRecord',
      'OperatorAvailabilityBlock',
      'CustomerClosureBlock',
    ].map((model) => {
      tables[model] ??= [];
      return [
        model,
        {
          list: jest.fn(async ({ filter, nextToken }: { filter?: Record<string, { eq: string }>; nextToken?: string }) => {
            const matches = tables[model].filter((row) =>
              Object.entries(filter ?? {}).every(([field, { eq }]) => row[field] === eq)
            );
            const index = nextToken ? Number(nextToken) : 0;
            const next = index + 1 < matches.length ? String(index + 1) : null;
            return { data: matches.slice(index, index + 1), errors: listErrors[model], nextToken: next };
          }),
          update: jest.fn(async (input: Row) => {
            if (failUpdates.has(input.id)) return { data: null, errors: [{ message: `update ${input.id} failed` }] };
            const row = tables[model].find((r) => r.id === input.id);
            if (row) Object.assign(row, input);
            return { data: row, errors: undefined };
          }),
        },
      ];
    })
  );

  return { client: { models }, models, failUpdates, listErrors };
}

function customerTables(): Tables {
  return {
    Customer: [{ id: 'c1' }],
    CustomerUser: [
      { id: 'cu-owner', customerId: 'c1', role: 'account_owner', userSub: 'sub-owner' },
      { id: 'cu-read', customerId: 'c1', role: 'read_only', userSub: 'sub-read' },
      { id: 'cu-pending', customerId: 'c1', role: 'read_only', userSub: 'pending:new@example.com' },
      { id: 'cu-other', customerId: 'c2', role: 'account_owner', userSub: 'sub-other' },
    ],
    Route: [
      { id: 'r1', customerId: 'c1' },
      { id: 'r2', customerId: 'c1' },
      { id: 'r-other', customerId: 'c2' },
    ],
    Stop: [
      { id: 's1', routeId: 'r1' },
      { id: 's2', routeId: 'r1' },
      { id: 's3', routeId: 'r2' },
      { id: 's-other', routeId: 'r-other' },
    ],
    Invoice: [{ id: 'inv1', customerId: 'c1' }],
    LineItem: [{ id: 'li1', customerId: 'c1' }],
    PaymentRecord: [{ id: 'pay1', customerId: 'c1' }],
    OperatorAvailabilityBlock: [{ id: 'oab1', customerId: 'c1' }],
    CustomerClosureBlock: [{ id: 'ccb1', customerId: 'c1' }],
  };
}

const stamped = (tables: Tables, model: string) =>
  Object.fromEntries(tables[model].map((row) => [row.id, row.viewerSubs]));

describe('syncCustomerAccess', () => {
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  afterEach(() => consoleErrorSpy.mockRestore());

  it("stamps every one of the customer's records with its real user subs, and nobody else's", async () => {
    const tables = customerTables();
    const { client } = fakeClient(tables);

    const result = await syncCustomerAccess(client, 'c1');

    const viewers = ['sub-owner', 'sub-read'];
    expect(tables.Customer[0]).toEqual({ id: 'c1', viewerSubs: viewers, accountOwnerSub: 'sub-owner' });
    expect(stamped(tables, 'Route')).toEqual({ r1: viewers, r2: viewers, 'r-other': undefined });
    expect(stamped(tables, 'Stop')).toEqual({ s1: viewers, s2: viewers, s3: viewers, 's-other': undefined });
    for (const model of ['Invoice', 'LineItem', 'PaymentRecord', 'OperatorAvailabilityBlock', 'CustomerClosureBlock']) {
      expect(tables[model][0].viewerSubs).toEqual(viewers);
    }
    expect(stamped(tables, 'CustomerUser')).toEqual({
      'cu-owner': viewers,
      'cu-read': viewers,
      'cu-pending': viewers,
      'cu-other': undefined,
    });
    expect(result).toEqual({
      updated: {
        Customer: 1,
        Route: 2,
        Stop: 3,
        Invoice: 1,
        LineItem: 1,
        PaymentRecord: 1,
        OperatorAvailabilityBlock: 1,
        CustomerClosureBlock: 1,
        CustomerUser: 3,
      },
      errors: [],
    });
  });

  it('includes a just-added user whose row is not listed yet', async () => {
    const tables = customerTables();
    const { client } = fakeClient(tables);

    await syncCustomerAccess(client, 'c1', { added: 'sub-new' });

    expect(tables.Invoice[0].viewerSubs).toEqual(['sub-owner', 'sub-read', 'sub-new']);
  });

  it('revokes a just-removed user even while their deleted row is still listed', async () => {
    const tables = customerTables();
    const { client, models } = fakeClient(tables);

    await syncCustomerAccess(client, 'c1', { removed: 'sub-read' });

    expect(tables.PaymentRecord[0].viewerSubs).toEqual(['sub-owner']);
    expect(tables.CustomerClosureBlock[0].viewerSubs).toEqual(['sub-owner']);
    // The deleted row itself isn't written back.
    expect(models.CustomerUser.update).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'cu-read' }));
  });

  it('leaves accountOwnerSub untouched when no owner has signed in yet', async () => {
    const tables = customerTables();
    tables.Customer[0].accountOwnerSub = 'sub-previous';
    tables.CustomerUser = [{ id: 'cu-owner', customerId: 'c1', role: 'account_owner', userSub: 'pending:o@example.com' }];
    const { client } = fakeClient(tables);

    await syncCustomerAccess(client, 'c1');

    expect(tables.Customer[0]).toEqual({ id: 'c1', viewerSubs: [], accountOwnerSub: 'sub-previous' });
  });

  it('writes nothing when the membership read has errors', async () => {
    const tables = customerTables();
    const { client, models, listErrors } = fakeClient(tables);
    listErrors.CustomerUser = [{ message: 'throttled' }];

    const result = await syncCustomerAccess(client, 'c1');

    expect(result.errors).toContainEqual({ message: 'throttled' });
    for (const model of Object.values(models)) {
      expect(model.update).not.toHaveBeenCalled();
    }
  });

  it('carries on past individual failures and reports them', async () => {
    const tables = customerTables();
    const { client, models, failUpdates, listErrors } = fakeClient(tables);
    failUpdates.add('r1');
    listErrors.Invoice = [{ message: 'invoice page failed' }];
    const networkError = new Error('socket hang up');
    models.LineItem.update.mockRejectedValueOnce(networkError);

    const result = await syncCustomerAccess(client, 'c1');

    expect(result.errors).toEqual(
      expect.arrayContaining([{ message: 'update r1 failed' }, { message: 'invoice page failed' }, networkError])
    );
    expect(result.updated.Route).toBe(1);
    // r1's stops and everything after the failures are still stamped.
    expect(tables.Stop[0].viewerSubs).toEqual(['sub-owner', 'sub-read']);
    expect(tables.CustomerClosureBlock[0].viewerSubs).toEqual(['sub-owner', 'sub-read']);
  });

  it("logs each failed record's model and id as it happens, not only at the end (#309)", async () => {
    const tables = customerTables();
    const { client, failUpdates } = fakeClient(tables);
    failUpdates.add('s2');

    await syncCustomerAccess(client, 'c1');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Stop s2'),
      expect.anything()
    );
  });

  it("stamps every one of a Route's Stops, however they're spread across list pages (#309)", async () => {
    const tables = customerTables();
    // W39-26-001: ten Stops interleaved with another customer's in scan order.
    tables.Stop = Array.from({ length: 10 }, (_, index) => [
      { id: `w39-${index + 1}`, routeId: 'r1' },
      { id: `other-${index + 1}`, routeId: 'r-other' },
    ]).flat();
    const { client } = fakeClient(tables);

    await syncCustomerAccess(client, 'c1');

    const unstamped = tables.Stop.filter((stop) => stop.routeId === 'r1' && !stop.viewerSubs);
    expect(unstamped).toEqual([]);
    expect(tables.Stop.filter((stop) => stop.routeId === 'r-other' && stop.viewerSubs)).toEqual([]);
  });

  it('reads Stops in one walk, not a table scan per Route (#309)', async () => {
    const tables = customerTables();
    tables.Route.push(...Array.from({ length: 20 }, (_, index) => ({ id: `r-extra-${index}`, customerId: 'c1' })));
    const { client, models } = fakeClient(tables);

    await syncCustomerAccess(client, 'c1');

    const walksStarted = models.Stop.list.mock.calls.filter(([options]) => !options.nextToken);
    expect(walksStarted).toHaveLength(1);
  });

  it('skips records that already carry the current viewers, so an interrupted sync resumes where it stopped (#309)', async () => {
    const tables = customerTables();
    // Same viewers in a different order still counts as already stamped.
    tables.Route[0].viewerSubs = ['sub-read', 'sub-owner'];
    tables.Stop[0].viewerSubs = ['sub-owner', 'sub-read'];
    tables.Stop[2].viewerSubs = ['sub-owner']; // stale: must be rewritten
    const { client, models } = fakeClient(tables);

    const result = await syncCustomerAccess(client, 'c1');

    const updatedIds = (model: string) => models[model].update.mock.calls.map(([input]) => input.id);
    expect(updatedIds('Route')).toEqual(['r2']);
    expect(updatedIds('Stop').sort()).toEqual(['s2', 's3']);
    expect(tables.Stop[2].viewerSubs).toEqual(['sub-owner', 'sub-read']);
    expect(result.updated).toMatchObject({ Route: 1, Stop: 2 });
  });
});
