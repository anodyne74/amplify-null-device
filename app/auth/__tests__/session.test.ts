import {
  getCurrentCustomerId,
  getCurrentCustomerEmail,
  verifyCustomerAccess,
  isSessionValid,
} from '../session';

describe('session utilities', () => {
  it('returns undefined customer ID when user is missing', () => {
    expect(getCurrentCustomerId(undefined)).toBeUndefined();
    expect(getCurrentCustomerId(null)).toBeUndefined();
  });

  it('prefers userId when present', () => {
    const user = {
      userId: 'user-id-123',
      sub: 'sub-123',
      signInUserSession: {
        idToken: {
          payload: {
            sub: 'token-sub-123',
          },
        },
      },
    };

    expect(getCurrentCustomerId(user)).toBe('user-id-123');
  });

  it('falls back to sub claim in token payload', () => {
    const user = {
      signInUserSession: {
        idToken: {
          payload: {
            sub: 'token-sub-456',
            email: 'customer@example.com',
          },
        },
      },
    };

    expect(getCurrentCustomerId(user)).toBe('token-sub-456');
    expect(getCurrentCustomerEmail(user)).toBe('customer@example.com');
  });

  it('verifies customer access against current identity', () => {
    const user = { userId: 'customer-abc' };

    expect(verifyCustomerAccess(user, 'customer-abc')).toBe(true);
    expect(verifyCustomerAccess(user, 'customer-def')).toBe(false);
  });

  it('treats session as valid when any supported identity field exists', () => {
    expect(isSessionValid({ userId: 'u-1' })).toBe(true);
    expect(
      isSessionValid({
        signInUserSession: { idToken: { payload: { sub: 'sub-1' } } },
      }),
    ).toBe(true);
    expect(isSessionValid({})).toBe(false);
  });
});
