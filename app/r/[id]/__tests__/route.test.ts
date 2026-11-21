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

  describe('behind the hosting proxy, where the request origin is the internal server', () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    afterEach(() => {
      if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = original;
    });

    it('redirects to the public site, not the internal origin', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://nulldevice.dev';
      const response = await GET(new NextRequest('https://localhost:3000/r/gsgjxw'), {
        params: Promise.resolve({ id: 'gsgjxw' }),
      });

      expect(response.headers.get('location')).toBe('https://nulldevice.dev/operator/routes/detail?code=gsgjxw');
    });

    it('ignores a trailing slash on the configured site', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://nulldevice.dev/';
      const response = await GET(new NextRequest('https://localhost:3000/r/gsgjxw'), {
        params: Promise.resolve({ id: 'gsgjxw' }),
      });

      expect(response.headers.get('location')).toBe('https://nulldevice.dev/operator/routes/detail?code=gsgjxw');
    });

    it('uses the request origin when no site is configured', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      const response = await GET(new NextRequest('http://localhost:3000/r/gsgjxw'), {
        params: Promise.resolve({ id: 'gsgjxw' }),
      });

      expect(response.headers.get('location')).toBe('http://localhost:3000/operator/routes/detail?code=gsgjxw');
    });
  });
});
