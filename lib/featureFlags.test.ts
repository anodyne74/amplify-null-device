import { isFeatureFlagName, resolveOnFlags, type FeatureFlagSettingRecord } from './featureFlags';

// The real registry ships empty (#297), so these tests pass their own list of
// registered names rather than depending on whichever flags exist.
const REGISTERED = ['alpha', 'beta'];

function setting(overrides: Partial<FeatureFlagSettingRecord> & { id: string }): FeatureFlagSettingRecord {
  return { state: 'off', selectedCustomerIds: [], ...overrides };
}

describe('resolveOnFlags', () => {
  it('treats a registered flag with no stored setting as off', () => {
    expect(resolveOnFlags([], 'cust-1', REGISTERED)).toEqual([]);
  });

  it('is off when the state is off, even for a Customer on its list', () => {
    const settings = [
      setting({ id: 'alpha', state: 'off' }),
      setting({ id: 'beta', state: 'off', selectedCustomerIds: ['cust-1'] }),
    ];
    expect(resolveOnFlags(settings, 'cust-1', REGISTERED)).toEqual([]);
  });

  it('is on in Selected mode only for Customers on the list', () => {
    const settings = [setting({ id: 'alpha', state: 'selected', selectedCustomerIds: ['cust-1', 'cust-2'] })];
    expect(resolveOnFlags(settings, 'cust-1', REGISTERED)).toEqual(['alpha']);
    expect(resolveOnFlags(settings, 'cust-3', REGISTERED)).toEqual([]);
  });

  it('is on in Everyone mode for every Customer, including one created after the switch', () => {
    const settings = [setting({ id: 'beta', state: 'everyone', everyoneSince: '2026-01-01T00:00:00Z' })];
    expect(resolveOnFlags(settings, 'cust-1', REGISTERED)).toEqual(['beta']);
    expect(resolveOnFlags(settings, 'customer-created-2026-06', REGISTERED)).toEqual(['beta']);
  });

  it('ignores a stored setting for a flag that is no longer registered', () => {
    const settings = [setting({ id: 'retired', state: 'everyone' }), setting({ id: 'alpha', state: 'everyone' })];
    expect(resolveOnFlags(settings, 'cust-1', REGISTERED)).toEqual(['alpha']);
  });

  it('is all off without a Customer', () => {
    expect(resolveOnFlags([setting({ id: 'alpha', state: 'everyone' })], '', REGISTERED)).toEqual([]);
  });
});

describe('isFeatureFlagName', () => {
  it('accepts only registered names', () => {
    expect(isFeatureFlagName('alpha', REGISTERED)).toBe(true);
    expect(isFeatureFlagName('retired', REGISTERED)).toBe(false);
    expect(isFeatureFlagName(42, REGISTERED)).toBe(false);
  });
});
