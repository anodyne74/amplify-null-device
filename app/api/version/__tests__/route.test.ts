/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown) => ({ status: 200, json: async () => body }),
  },
}));

import { GET } from '../route';

describe('GET /api/version', () => {
  const original = process.env.NEXT_PUBLIC_BUILD_NUMBER;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BUILD_NUMBER;
    else process.env.NEXT_PUBLIC_BUILD_NUMBER = original;
  });

  it('reports the Build Number and nothing else', async () => {
    process.env.NEXT_PUBLIC_BUILD_NUMBER = '20261102-a6f6444-64';
    expect(await GET().json()).toEqual({ build: '20261102-a6f6444-64' });
  });

  it('reports local outside a deploy', async () => {
    delete process.env.NEXT_PUBLIC_BUILD_NUMBER;
    expect(await GET().json()).toEqual({ build: 'local' });
  });
});
