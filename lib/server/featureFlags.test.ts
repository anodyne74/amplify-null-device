import { getOnFlagsForCustomer, isFeatureOnForCustomer, planFeatureFlagChange } from './featureFlags';
import type { FeatureFlagName } from '@/lib/featureFlags';

// The registry ships empty (#297); give the tests two registered flags.
jest.mock('@/lib/featureFlags', () => {
  const actual = jest.requireActual('@/lib/featureFlags');
  const registered = ['alpha', 'beta'];
  return {
    ...actual,
    FEATURE_FLAG_NAMES: registered,
    resolveOnFlags: (settings: unknown[], customerId: string) =>
      actual.resolveOnFlags(settings, customerId, registered),
  };
});

const listMock = jest.fn();
const client = { models: { FeatureFlagSetting: { list: listMock } } };
const alpha = 'alpha' as FeatureFlagName;

beforeEach(() => {
  listMock.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('getOnFlagsForCustomer', () => {
  it('resolves the stored settings for the Customer', async () => {
    listMock.mockResolvedValue({
      data: [
        { id: 'alpha', state: 'selected', selectedCustomerIds: ['cust-1'] },
        { id: 'beta', state: 'off', selectedCustomerIds: ['cust-1'] },
      ],
    });
    await expect(getOnFlagsForCustomer(client, 'cust-1')).resolves.toEqual(['alpha']);
    await expect(getOnFlagsForCustomer(client, 'cust-2')).resolves.toEqual([]);
  });

  it('is all off when the read returns errors', async () => {
    listMock.mockResolvedValue({
      data: [{ id: 'alpha', state: 'everyone' }],
      errors: [{ message: 'Unauthorized' }],
    });
    await expect(getOnFlagsForCustomer(client, 'cust-1')).resolves.toEqual([]);
  });

  it('is all off when the read throws', async () => {
    listMock.mockRejectedValue(new Error('network down'));
    await expect(getOnFlagsForCustomer(client, 'cust-1')).resolves.toEqual([]);
  });

  it('is all off without a Customer, without reading', async () => {
    await expect(getOnFlagsForCustomer(client, '')).resolves.toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe('isFeatureOnForCustomer', () => {
  it('agrees with getOnFlagsForCustomer', async () => {
    listMock.mockResolvedValue({ data: [{ id: 'alpha', state: 'everyone' }] });
    await expect(isFeatureOnForCustomer(client, 'cust-1', alpha)).resolves.toBe(true);
    await expect(isFeatureOnForCustomer(client, 'cust-1', 'beta' as FeatureFlagName)).resolves.toBe(false);
  });

  it('is off when the check fails', async () => {
    listMock.mockRejectedValue(new Error('network down'));
    await expect(isFeatureOnForCustomer(client, 'cust-1', alpha)).resolves.toBe(false);
  });
});

describe('planFeatureFlagChange', () => {
  const now = '2026-09-27T01:00:00.000Z';

  it('moves to Everyone, stamping everyoneSince and recording every Customer as affected', () => {
    const plan = planFeatureFlagChange(
      { id: 'alpha', state: 'selected', selectedCustomerIds: ['c1'] },
      { action: 'set-state', state: 'everyone' },
      now
    );
    expect(plan).toEqual({
      next: { state: 'everyone', selectedCustomerIds: ['c1'], everyoneSince: now },
      details: { oldState: 'selected', newState: 'everyone', affectedCustomers: 'all' },
    });
  });

  it('keeps the Selected list when switching Off, and restores it when switching back', () => {
    const off = planFeatureFlagChange(
      { id: 'alpha', state: 'selected', selectedCustomerIds: ['c1', 'c2'] },
      { action: 'set-state', state: 'off' },
      now
    );
    expect(off?.next).toEqual({ state: 'off', selectedCustomerIds: ['c1', 'c2'], everyoneSince: null });
    expect(off?.details).toEqual({ oldState: 'selected', newState: 'off', affectedCustomerIds: ['c1', 'c2'] });

    const back = planFeatureFlagChange({ id: 'alpha', ...off!.next }, { action: 'set-state', state: 'selected' }, now);
    expect(back?.next).toEqual({ state: 'selected', selectedCustomerIds: ['c1', 'c2'], everyoneSince: null });
  });

  it('clears everyoneSince when leaving Everyone', () => {
    const plan = planFeatureFlagChange(
      { id: 'alpha', state: 'everyone', everyoneSince: '2026-01-01T00:00:00Z' },
      { action: 'set-state', state: 'off' },
      now
    );
    expect(plan?.next.everyoneSince).toBeNull();
    expect(plan?.details.affectedCustomers).toBe('all');
  });

  it('treats a flag with no stored setting as Off', () => {
    const plan = planFeatureFlagChange(null, { action: 'set-state', state: 'selected' }, now);
    expect(plan).toEqual({
      next: { state: 'selected', selectedCustomerIds: [], everyoneSince: null },
      details: { oldState: 'off', newState: 'selected', affectedCustomerIds: [] },
    });
  });

  it('records the Customers added and removed when the list changes, without touching the state', () => {
    const plan = planFeatureFlagChange(
      { id: 'alpha', state: 'selected', selectedCustomerIds: ['c1', 'c2'] },
      { action: 'set-customers', customerIds: ['c2', 'c3', 'c3'] },
      now
    );
    expect(plan).toEqual({
      next: { state: 'selected', selectedCustomerIds: ['c2', 'c3'], everyoneSince: null },
      details: { oldState: 'selected', newState: 'selected', addedCustomerIds: ['c3'], removedCustomerIds: ['c1'] },
    });
  });

  it('clears the list as its own action', () => {
    const plan = planFeatureFlagChange(
      { id: 'alpha', state: 'off', selectedCustomerIds: ['c1'] },
      { action: 'clear-customers' },
      now
    );
    expect(plan?.next.selectedCustomerIds).toEqual([]);
    expect(plan?.details).toEqual({ oldState: 'off', newState: 'off', addedCustomerIds: [], removedCustomerIds: ['c1'] });
  });

  it('returns null for a change that changes nothing', () => {
    const current = { id: 'alpha', state: 'selected' as const, selectedCustomerIds: ['c1'] };
    expect(planFeatureFlagChange(current, { action: 'set-state', state: 'selected' }, now)).toBeNull();
    expect(planFeatureFlagChange(current, { action: 'set-customers', customerIds: ['c1'] }, now)).toBeNull();
    expect(planFeatureFlagChange(null, { action: 'clear-customers' }, now)).toBeNull();
  });
});
