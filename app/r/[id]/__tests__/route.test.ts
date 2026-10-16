/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('Route short link', () => {
  it('opens the Route in the operator portal', async () => {
    const response = await GET(new NextRequest('https://www.nulldevice.dev/r/route-1'), {
      params: Promise.resolve({ id: 'route-1' }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://www.nulldevice.dev/operator/routes/detail?id=route-1');
  });

  it('passes an odd id through safely for the Route page to report as not found', async () => {
    const response = await GET(new NextRequest('https://www.nulldevice.dev/r/a%26b'), {
      params: Promise.resolve({ id: 'a&b' }),
    });

    expect(response.headers.get('location')).toBe('https://www.nulldevice.dev/operator/routes/detail?id=a%26b');
  });

  it('opens a Route Link code by its code, whatever the case', async () => {
    const response = await GET(new NextRequest('https://www.nulldevice.dev/r/K7q2M9'), {
      params: Promise.resolve({ id: 'K7q2M9' }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://www.nulldevice.dev/operator/routes/detail?code=k7q2m9');
  });

  it('still opens a Route id from a text sent before codes', async () => {
    const id = '3f2b8c1e-9a4d-4e6b-b7c2-1d5e8f0a9b3c';
    const response = await GET(new NextRequest(`https://www.nulldevice.dev/r/${id}`), {
      params: Promise.resolve({ id }),
    });

    expect(response.headers.get('location')).toBe(`https://www.nulldevice.dev/operator/routes/detail?id=${id}`);
  });
});
