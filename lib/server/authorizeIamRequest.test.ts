/**
 * @jest-environment node
 */
const verifyMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const customerUserListMock = jest.fn(async ({ filter }: { filter: { userSub: { eq: string } } }) => ({
  data: tables.CustomerUser.filter((row) => row.userSub === filter.userSub.eq),
}));

const iamClient = {
  models: {
    CustomerUser: { list: customerUserListMock },
    FeatureFlagSetting: { list: async () => ({ data: tables.FeatureFlagSetting }) },
  },
};

jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

import { authorizeIamRequest, type AuthorizeIamRequestOptions, type RequiredGroup } from '@/lib/server/authorizeIamRequest';

const OWNER = { sub: 'sub-owner', 'cognito:groups': ['customer'] };
const READ_ONLY = { sub: 'sub-reader', 'cognito:groups': ['customer'] };
const OTHER_OWNER = { sub: 'sub-other', 'cognito:groups': ['customer'] };
const NO_ROW = { sub: 'sub-stranger', 'cognito:groups': ['customer'] };
const ADMIN = { sub: 'sub-admin', 'cognito:groups': ['administrator'] };
const OPERATOR = { sub: 'sub-operator', 'cognito:groups': ['operator'] };
const OPERATOR_AND_CUSTOMER = { sub: 'sub-owner', 'cognito:groups': ['customer', 'operator'] };

async function authorize(
  caller: object | null,
  groups: RequiredGroup | readonly RequiredGroup[],
  options?: AuthorizeIamRequestOptions
) {
  verifyMock.mockResolvedValue(caller);
  const headers = new Headers(caller ? { authorization: 'Bearer token-value' } : {});
  return authorizeIamRequest({ headers } as Request, groups, options);
}

const ALL: RequiredGroup[] = ['customer', 'operator', 'administrator'];

describe('authorizeIamRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(tables, {
      CustomerUser: [
        { id: 'cu1', userSub: 'sub-owner', customerId: 'c1', role: 'account_owner', name: 'Olive' },
        { id: 'cu2', userSub: 'sub-reader', customerId: 'c1', role: 'read_only' },
        { id: 'cu3', userSub: 'sub-other', customerId: 'c2', role: 'account_owner' },
      ],
      FeatureFlagSetting: [{ id: 'property-history', state: 'selected', selectedCustomerIds: ['c1'] }],
    });
  });

  it('refuses a request with no session, and a caller outside the allowed groups', async () => {
    expect(await authorize(null, ALL)).toMatchObject({ ok: false, status: 401 });
    expect(await authorize(OWNER, 'administrator')).toMatchObject({ ok: false, status: 403 });
  });

  it("scopes a customer to the Customer on their own CustomerUser row", async () => {
    const result = await authorize(OWNER, 'customer');
    expect(result).toMatchObject({
      ok: true,
      caller: { audience: 'customer', customerId: 'c1', accountOwner: true, row: { name: 'Olive' } },
      client: iamClient,
    });
    expect(customerUserListMock).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { userSub: { eq: 'sub-owner' } } })
    );
  });

  it('lets staff through without reading CustomerUser or checking flags or Account Owner', async () => {
    for (const staff of [ADMIN, OPERATOR]) {
      const result = await authorize(staff, ALL, { flag: 'property-history', accountOwnersOnly: true });
      expect(result).toMatchObject({ ok: true, caller: { audience: 'staff' } });
    }
    expect(customerUserListMock).not.toHaveBeenCalled();
  });

  it('treats a caller as a customer when the route allows none of their staff groups', async () => {
    const result = await authorize(OPERATOR_AND_CUSTOMER, 'customer');
    expect(result).toMatchObject({ ok: true, caller: { audience: 'customer', customerId: 'c1' } });
  });

  it('refuses a customer-group user with no CustomerUser row', async () => {
    expect(await authorize(NO_ROW, 'customer')).toMatchObject({ ok: false, status: 403 });
  });

  it("answers 500, never 'not found', when the CustomerUser read fails", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    customerUserListMock.mockResolvedValueOnce({ data: [], errors: [{ message: 'throttled' }] } as never);
    expect(await authorize(OWNER, 'customer')).toMatchObject({ ok: false, status: 500 });
  });

  it("refuses a customer whose Customer doesn't have the flag on", async () => {
    expect(await authorize(OWNER, 'customer', { flag: 'property-history' })).toMatchObject({ ok: true });
    expect(await authorize(OTHER_OWNER, 'customer', { flag: 'property-history' })).toMatchObject({
      ok: false,
      status: 403,
      error: "This isn't available for your account.",
    });
  });

  it('refuses a read-only customer user when Account Owners only', async () => {
    expect(await authorize(READ_ONLY, 'customer')).toMatchObject({ ok: true, caller: { accountOwner: false } });
    expect(await authorize(READ_ONLY, 'customer', { accountOwnersOnly: true })).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});
