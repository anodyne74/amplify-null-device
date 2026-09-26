import { listAll } from './listAll';

function clientWithStopPages(pages: Array<{ data: unknown[]; errors?: unknown[]; nextToken?: string | null }>) {
  const list = jest.fn();
  pages.forEach((page) => list.mockResolvedValueOnce(page));
  return { client: { models: { Stop: { list } } }, list };
}

describe('listAll', () => {
  it('walks nextToken until exhausted and concatenates every page', async () => {
    const { client, list } = clientWithStopPages([
      { data: [{ id: 's1' }], nextToken: 't1' },
      // A filtered scan can return an empty page mid-walk -- keep going.
      { data: [], nextToken: 't2' },
      { data: [{ id: 's2' }, { id: 's3' }], nextToken: null },
    ]);

    const result = await listAll(client, 'Stop', { filter: { routeId: { eq: 'route-1' } } });

    expect(result.data.map((stop) => stop.id)).toEqual(['s1', 's2', 's3']);
    expect(result.errors).toEqual([]);
    expect(list).toHaveBeenCalledTimes(3);
    expect(list).toHaveBeenNthCalledWith(1, { filter: { routeId: { eq: 'route-1' } }, limit: 1000, nextToken: undefined });
    expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ nextToken: 't1' }));
    expect(list).toHaveBeenNthCalledWith(3, expect.objectContaining({ nextToken: 't2' }));
  });

  it('keeps walking past page errors and returns every error alongside the rows', async () => {
    const { client } = clientWithStopPages([
      { data: [{ id: 's1' }], errors: [{ message: 'field auth' }], nextToken: 't1' },
      { data: [{ id: 's2' }], errors: [{ message: 'another' }] },
    ]);

    const result = await listAll(client, 'Stop');

    expect(result.data.map((stop) => stop.id)).toEqual(['s1', 's2']);
    expect(result.errors).toEqual([{ message: 'field auth' }, { message: 'another' }]);
  });

  it('drops null rows Amplify returns for records the caller cannot read', async () => {
    const { client } = clientWithStopPages([{ data: [{ id: 's1' }, null, { id: 's2' }] }]);

    const result = await listAll(client, 'Stop');

    expect(result.data.map((stop) => stop.id)).toEqual(['s1', 's2']);
  });

  it('propagates a thrown error', async () => {
    const list = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(listAll({ models: { Stop: { list } } }, 'Stop')).rejects.toThrow('network down');
  });
});
