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
});
