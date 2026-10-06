const mockFetchAuthSession = jest.fn();

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: () => mockFetchAuthSession(),
}));

import { ApiError, callApi } from '@/lib/apiClient';

// jsdom has no Response; this stands in for the parts callApi reads.
function respond(status: number, body: string) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve().then(() => JSON.parse(body)),
  });
}

describe('callApi', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    mockFetchAuthSession.mockResolvedValue({ tokens: { idToken: { toString: () => 'id-token-1' } } });
  });

  it('POSTs the body as JSON with the ID token and resolves to the response', async () => {
    fetchMock.mockReturnValue(respond(200, JSON.stringify({ sentTo: 'a@example.com' })));

    await expect(callApi('/api/admin/send-job-assigned-email', { routeId: 'r1' })).resolves.toEqual({
      sentTo: 'a@example.com',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/send-job-assigned-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer id-token-1' },
      body: JSON.stringify({ routeId: 'r1' }),
    });
  });

  it('throws a 401 without sending anything when there is no ID token', async () => {
    mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

    const error = await callApi('/api/admin/users', {}).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: 'No session token found. Please sign in again.', status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws the route's own error message with its status", async () => {
    fetchMock.mockReturnValue(respond(409, JSON.stringify({ error: 'That teammate is already invited.' })));

    await expect(callApi('/api/customer/invite-user', {})).rejects.toMatchObject({
      message: 'That teammate is already invited.',
      status: 409,
    });
  });

  it.each([
    ['a non-JSON body', '<html>Bad Gateway</html>'],
    ['a JSON body without an error', JSON.stringify({ ok: false })],
  ])('falls back to the status for %s', async (_label, body) => {
    fetchMock.mockReturnValue(respond(502, body));

    await expect(callApi('/api/admin/users', {})).rejects.toMatchObject({
      message: 'Request failed (status 502).',
      status: 502,
    });
  });

  it('passes a network failure through', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(callApi('/api/admin/users', {})).rejects.toThrow('Failed to fetch');
  });
});
