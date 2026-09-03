import { fetchAuthSession } from 'aws-amplify/auth';
import {
  getUserGroups,
  isCustomer,
  isOperator,
  isAdmin,
  getUserEmail,
  getUsername,
  getUserDisplayName,
  fetchUserDisplayName,
  hasGroup,
} from './amplify-config';

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}));

const mockFetchAuthSession = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;

describe('amplify-config utilities', () => {
  // Mock user with customer group
  const customerUser = {
    username: 'customer123',
    signInUserSession: {
      idToken: {
        payload: {
          email: 'customer@example.com',
          sub: 'user-id-123',
          'cognito:groups': ['customer'],
        },
      },
    },
  };

  // Mock user with operator group
  const operatorUser = {
    username: 'operator456',
    signInUserSession: {
      idToken: {
        payload: {
          email: 'operator@example.com',
          sub: 'user-id-456',
          'cognito:groups': ['operator'],
        },
      },
    },
  };

  // Mock user with no groups
  const ungroupedUser = {
    username: 'ungrouped789',
    signInUserSession: {
      idToken: {
        payload: {
          email: 'ungrouped@example.com',
          sub: 'user-id-789',
        },
      },
    },
  };

  describe('getUserGroups', () => {
    it('should return groups array for user with groups', () => {
      const groups = getUserGroups(customerUser);
      expect(groups).toEqual(['customer']);
    });

    it('should return empty array for user without groups', () => {
      const groups = getUserGroups(ungroupedUser);
      expect(groups).toEqual([]);
    });

    it('should return empty array for null user', () => {
      const groups = getUserGroups(null);
      expect(groups).toEqual([]);
    });

    it('should return empty array for undefined user', () => {
      const groups = getUserGroups(undefined);
      expect(groups).toEqual([]);
    });
  });

  describe('isCustomer', () => {
    it('should return true for user with customer group', () => {
      expect(isCustomer(customerUser)).toBe(true);
    });

    it('should return false for user with operator group only', () => {
      expect(isCustomer(operatorUser)).toBe(false);
    });

    it('should return false for user without groups (pending approval)', () => {
      expect(isCustomer(ungroupedUser)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(isCustomer(null)).toBe(false);
    });
  });

  describe('isOperator', () => {
    it('should return true for user with operator group', () => {
      expect(isOperator(operatorUser)).toBe(true);
    });

    it('should return false for user with customer group only', () => {
      expect(isOperator(customerUser)).toBe(false);
    });

    it('should return false for user without groups', () => {
      expect(isOperator(ungroupedUser)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(isOperator(null)).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return false for operator user (operator ≠ administrator)', () => {
      expect(isAdmin(operatorUser)).toBe(false);
    });

    it('should return false for customer user', () => {
      expect(isAdmin(customerUser)).toBe(false);
    });

    it('should return false for ungrouped user', () => {
      expect(isAdmin(ungroupedUser)).toBe(false);
    });
  });

  describe('getUserEmail', () => {
    it('should return email for customer user', () => {
      expect(getUserEmail(customerUser)).toBe('customer@example.com');
    });

    it('should return email for operator user', () => {
      expect(getUserEmail(operatorUser)).toBe('operator@example.com');
    });

    it('should return undefined for null user', () => {
      expect(getUserEmail(null)).toBeUndefined();
    });
  });

  describe('getUsername', () => {
    it('should return username for customer user', () => {
      expect(getUsername(customerUser)).toBe('customer123');
    });

    it('should return username for operator user', () => {
      expect(getUsername(operatorUser)).toBe('operator456');
    });

    it('should return undefined for null user', () => {
      expect(getUsername(null)).toBeUndefined();
    });
  });

  describe('getUserDisplayName', () => {
    it('returns a configured first name claim when present', () => {
      expect(
        getUserDisplayName({
          signInUserSession: {
            idToken: { payload: { given_name: '  David  ', email: 'david@example.com' } },
          },
          userId: 'abc-123',
        })
      ).toBe('David');
    });

    it('returns a configured name claim when first name is not present', () => {
      expect(
        getUserDisplayName({
          attributes: { name: 'Null Device Admin' },
          signInUserSession: {
            idToken: { payload: { email: 'admin@example.com' } },
          },
        })
      ).toBe('Null Device Admin');
    });

    it('does not fall back to email, username, or user id when no name claim is present', () => {
      expect(
        getUserDisplayName({
          username: 'david@example.com',
          userId: 'abc-123',
          signInDetails: { loginId: 'david@example.com' },
          signInUserSession: {
            idToken: { payload: { email: 'david@example.com', sub: 'abc-123' } },
          },
        })
      ).toBeUndefined();
    });
  });

  describe('fetchUserDisplayName', () => {
    afterEach(() => {
      mockFetchAuthSession.mockReset();
    });

    it('returns the given_name claim from the active session', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: { idToken: { payload: { given_name: '  Aishling  ', name: 'Aishling OKeeffe' } } },
      } as any);

      expect(await fetchUserDisplayName()).toBe('Aishling');
    });

    it('falls back to the name claim when given_name is absent', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: { idToken: { payload: { name: 'Aishling' } } },
      } as any);

      expect(await fetchUserDisplayName()).toBe('Aishling');
    });

    it('returns undefined when no name claim is present', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: { idToken: { payload: { email: 'aishling@example.com' } } },
      } as any);

      expect(await fetchUserDisplayName()).toBeUndefined();
    });

    it('returns undefined when fetching the session fails', async () => {
      mockFetchAuthSession.mockRejectedValue(new Error('no session'));

      expect(await fetchUserDisplayName()).toBeUndefined();
    });
  });

  describe('hasGroup', () => {
    it('should return true if user has specified group', () => {
      expect(hasGroup(customerUser, 'customer')).toBe(true);
      expect(hasGroup(operatorUser, 'operator')).toBe(true);
    });

    it('should return false if user does not have specified group', () => {
      expect(hasGroup(customerUser, 'operator')).toBe(false);
      expect(hasGroup(operatorUser, 'customer')).toBe(false);
    });

    it('should return false for null user', () => {
      expect(hasGroup(null, 'customer')).toBe(false);
    });
  });
});
