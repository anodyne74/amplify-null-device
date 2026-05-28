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
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

import { POST } from '@/app/api/admin/static-route-map/route';

describe('static route map API', () => {
  const originalFetch = global.fetch;
  const originalResponse = (global as any).Response;
  const originalMapsKey = process.env.GOOGLE_MAPS_API_KEY;

  class MockResponse {
    status: number;
    headers: Headers;
    private body: unknown;

    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers ?? {});
    }

    async arrayBuffer() {
      if (this.body instanceof ArrayBuffer) return this.body;
      if (ArrayBuffer.isView(this.body)) return this.body.buffer;
      return new ArrayBuffer(0);
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-maps-key';
    global.fetch = jest.fn();
    (global as any).Response = MockResponse;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    (global as any).Response = originalResponse;
    process.env.GOOGLE_MAPS_API_KEY = originalMapsKey;
  });

  function makeRequest(options?: {
    token?: string;
    json?: () => Promise<unknown>;
  }) {
    return {
      headers: new Headers(options?.token ? { authorization: `Bearer ${options.token}` } : {}),
      json:
        options?.json ??
        (async () => ({
          markers: [{ latitude: -37.81, longitude: 144.96 }],
        })),
    } as any;
  }

  it('returns 401 when bearer token is missing', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when token verification fails', async () => {
    verifyMock.mockRejectedValue(new Error('invalid token'));

    const response = await POST(makeRequest({ token: 'bad-token' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
  });

  it('returns 403 for non-admin users', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['operator'] });

    const response = await POST(makeRequest({ token: 'user-token' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden: admin access required' });
  });

  it('returns 400 when JSON payload is invalid', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['administrator'] });

    const response = await POST(
      makeRequest({
        token: 'admin-token',
        json: async () => {
          throw new Error('bad json');
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid request payload.' });
  });

  it('returns 400 when no valid markers are supplied', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['administrator'] });

    const response = await POST(
      makeRequest({
        token: 'admin-token',
        json: async () => ({ markers: [{ latitude: 'x', longitude: null }] }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'At least one valid marker is required.' });
  });

  it('returns 502 when Google static map fetch fails', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['administrator'] });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const response = await POST(makeRequest({ token: 'admin-token' }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch static map image.' });
  });

  it('returns image response when map generation succeeds', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['administrator'] });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const response = await POST(makeRequest({ token: 'admin-token' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    const payload = await response.arrayBuffer();
    expect(payload.byteLength).toBe(3);
  });
});
