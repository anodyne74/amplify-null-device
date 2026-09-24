const verifyMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

import { verifyIamCaller } from './verifyIamCaller';

function makeRequest(token?: string): Request {
  return {
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
  } as Request;
}

describe('verifyIamCaller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects with 401 when no bearer token is present', async () => {
    const result = await verifyIamCaller(makeRequest(), 'administrator');
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('rejects with 401 when token verification fails', async () => {
    verifyMock.mockRejectedValue(new Error('invalid token'));

    const result = await verifyIamCaller(makeRequest('bad-token'), 'administrator');
    expect(result).toEqual({ ok: false, status: 401, error: 'Invalid token' });
  });

  it('rejects with 403 for a verified caller outside the required group, and still returns claims/token for audit logging', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['operator'] });

    const result = await verifyIamCaller(makeRequest('operator-token'), 'administrator');
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden: admin access required',
      claims: { sub: 'sub-1', 'cognito:groups': ['operator'] },
      token: 'operator-token',
    });
  });

  it('rejects with the customer-scoped message when requiredGroup is customer', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['operator'] });

    const result = await verifyIamCaller(makeRequest('operator-token'), 'customer');
    expect(result).toMatchObject({ ok: false, status: 403, error: 'Forbidden: customer access required' });
  });

  it('rejects a customer-group caller with no sub even though the group matches', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['customer'] });

    const result = await verifyIamCaller(makeRequest('token'), 'customer');
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('resolves with claims and the raw bearer token for a verified caller in the required group', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-1', email: 'a@example.com', 'cognito:groups': ['administrator'] });

    const result = await verifyIamCaller(makeRequest('admin-token'), 'administrator');
    expect(result).toEqual({
      ok: true,
      claims: { sub: 'sub-1', email: 'a@example.com', 'cognito:groups': ['administrator'] },
      token: 'admin-token',
    });
  });
});
