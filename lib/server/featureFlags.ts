import { listAll } from '@/lib/listAll';
import {
  resolveOnFlags,
  type FeatureFlagChange,
  type FeatureFlagName,
  type FeatureFlagSettingRecord,
  type FeatureFlagState,
} from '@/lib/featureFlags';

/**
 * Server-side Feature Flag checks (ADR 0005). Both the customer flags endpoint
 * and every flagged customer write use these, so they always agree. Pass the
 * IAM client from authorizeIamRequest -- customers can't read
 * FeatureFlagSetting themselves.
 *
 * Fails closed: any read error means every flag is off, never an exception,
 * so a broken flag read can't take the portal down with it. Operators and
 * administrators are never subject to these checks.
 */
export async function getOnFlagsForCustomer(
  client: { models: object },
  customerId: string
): Promise<FeatureFlagName[]> {
  if (!customerId) return [];
  try {
    const { data, errors } = await listAll(client, 'FeatureFlagSetting');
    if (errors.length > 0) {
      console.error('Reading feature flags failed; treating every flag as off:', errors);
      return [];
    }
    return resolveOnFlags(data as FeatureFlagSettingRecord[], customerId);
  } catch (err) {
    console.error('Reading feature flags failed; treating every flag as off:', err);
    return [];
  }
}

export async function isFeatureOnForCustomer(
  client: { models: object },
  customerId: string,
  name: FeatureFlagName
): Promise<boolean> {
  return (await getOnFlagsForCustomer(client, customerId)).includes(name);
}

/** What a change's AuditLog entry records in `details`. */
export interface FeatureFlagChangeDetails {
  oldState: FeatureFlagState;
  newState: FeatureFlagState;
  /** A state change: who it reaches -- every Customer when Everyone is involved. */
  affectedCustomers?: 'all';
  affectedCustomerIds?: string[];
  /** A Selected Customers list change. */
  addedCustomerIds?: string[];
  removedCustomerIds?: string[];
}

export interface FeatureFlagChangePlan {
  next: { state: FeatureFlagState; selectedCustomerIds: string[]; everyoneSince: string | null };
  details: FeatureFlagChangeDetails;
}

/**
 * Works out a flag's next stored setting and its audit details, or null when
 * the change would change nothing (so nothing is written or audited). No
 * stored setting means Off. Switching Off keeps the Selected list -- only
 * 'clear-customers' empties it. everyoneSince is set on entering Everyone and
 * cleared on leaving it.
 */
export function planFeatureFlagChange(
  current: FeatureFlagSettingRecord | null,
  change: FeatureFlagChange,
  now: string
): FeatureFlagChangePlan | null {
  const oldState = current?.state ?? 'off';
  const oldIds = (current?.selectedCustomerIds ?? []).filter((id): id is string => !!id);

  if (change.action === 'set-state') {
    if (change.state === oldState) return null;
    const everyoneInvolved = oldState === 'everyone' || change.state === 'everyone';
    return {
      next: {
        state: change.state,
        selectedCustomerIds: oldIds,
        everyoneSince: change.state === 'everyone' ? now : null,
      },
      details: {
        oldState,
        newState: change.state,
        ...(everyoneInvolved ? { affectedCustomers: 'all' as const } : { affectedCustomerIds: oldIds }),
      },
    };
  }

  const newIds = change.action === 'clear-customers' ? [] : [...new Set(change.customerIds)];
  const addedCustomerIds = newIds.filter((id) => !oldIds.includes(id));
  const removedCustomerIds = oldIds.filter((id) => !newIds.includes(id));
  if (addedCustomerIds.length === 0 && removedCustomerIds.length === 0) return null;
  return {
    next: { state: oldState, selectedCustomerIds: newIds, everyoneSince: current?.everyoneSince ?? null },
    details: { oldState, newState: oldState, addedCustomerIds, removedCustomerIds },
  };
}
