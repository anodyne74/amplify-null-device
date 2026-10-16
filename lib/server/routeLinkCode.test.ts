import { ensureRouteLinkCode, newRouteLinkCode } from './routeLinkCode';
import { routeLinkCode } from '@/lib/routeLink';
import type { IamDataClient } from '@/lib/server/iamDataClient';

const get = jest.fn();
const byCode = jest.fn();
const graphql = jest.fn();
const client = {
  models: { Route: { get, listRoutesByRouteLinkCode: byCode } },
  graphql,
} as unknown as IamDataClient;

const stored = (routeLinkCode?: string) => ({ data: { id: 'route-1', routeLinkCode }, errors: undefined });

describe('newRouteLinkCode', () => {
  it('is always shaped like a Route Link code', () => {
    for (let i = 0; i < 200; i += 1) expect(routeLinkCode(newRouteLinkCode())).not.toBeNull();
  });
});

describe('ensureRouteLinkCode', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    byCode.mockResolvedValue({ data: [], errors: undefined });
    graphql.mockResolvedValue({ data: { updateRoute: { id: 'route-1' } } });
  });

  it('uses the code a Route already has and writes nothing', async () => {
    get.mockResolvedValue(stored('k7q2m9'));

    await expect(ensureRouteLinkCode(client, 'route-1')).resolves.toBe('k7q2m9');
    expect(graphql).not.toHaveBeenCalled();
  });

  it('makes a code for a Route with none, stored only if the Route still has none', async () => {
    get.mockResolvedValue(stored());

    const code = await ensureRouteLinkCode(client, 'route-1');

    expect(routeLinkCode(code)).toBe(code);
    expect(byCode).toHaveBeenCalledWith({ routeLinkCode: code }, expect.anything());
    expect(graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: { id: 'route-1', routeLinkCode: code },
          condition: { routeLinkCode: { attributeExists: false } },
        },
      })
    );
  });

  it("makes another code when one is another Route's", async () => {
    get.mockResolvedValue(stored());
    byCode.mockResolvedValueOnce({ data: [{ id: 'route-2' }], errors: undefined });

    await ensureRouteLinkCode(client, 'route-1');

    expect(byCode).toHaveBeenCalledTimes(2);
    expect(graphql).toHaveBeenCalledTimes(1);
    const [first, second] = byCode.mock.calls.map(([args]) => args.routeLinkCode);
    expect(graphql.mock.calls[0][0].variables.input.routeLinkCode).toBe(second);
    expect(first).not.toBeUndefined();
  });

  it('uses the other request’s code when it stored one first', async () => {
    get.mockResolvedValueOnce(stored()).mockResolvedValueOnce(stored('winner'));
    graphql.mockRejectedValue({ errors: [{ errorType: 'DynamoDB:ConditionalCheckFailedException' }] });

    await expect(ensureRouteLinkCode(client, 'route-1')).resolves.toBe('winner');
  });

  it('uses the other request’s code when the refusal comes back as errors', async () => {
    get.mockResolvedValueOnce(stored()).mockResolvedValueOnce(stored('winner'));
    graphql.mockResolvedValue({ data: null, errors: [{ errorType: 'DynamoDB:ConditionalCheckFailedException' }] });

    await expect(ensureRouteLinkCode(client, 'route-1')).resolves.toBe('winner');
  });

  it('throws when the write fails and no code was stored', async () => {
    get.mockResolvedValue(stored());
    graphql.mockRejectedValue(new Error('network'));

    await expect(ensureRouteLinkCode(client, 'route-1')).rejects.toThrow('Could not store the Route Link');
  });

  it('gives up when every code made is taken', async () => {
    get.mockResolvedValue(stored());
    byCode.mockResolvedValue({ data: [{ id: 'route-2' }], errors: undefined });

    await expect(ensureRouteLinkCode(client, 'route-1')).rejects.toThrow('no other Route has');
    expect(graphql).not.toHaveBeenCalled();
  });

  it('throws when the Route cannot be read', async () => {
    get.mockResolvedValue({ data: null, errors: [{ message: 'x' }] });

    await expect(ensureRouteLinkCode(client, 'route-1')).rejects.toThrow('Could not read the Route');
  });
});
