/**
 * Feature Flags (CONTEXT.md, docs/adr/0005-feature-flags-resolved-server-side.md):
 * temporary per-Customer switches for rolling out a customer portal feature.
 *
 * This module is the registry and the one resolution rule, shared by the
 * server (lib/server/featureFlags.ts, the customer and admin API routes) and
 * the admin UI. It has no data access of its own. Customers never read flag
 * records -- they get only their on-flag names from /api/customer/feature-flags.
 *
 * Adding a flag: add an entry to FEATURE_FLAGS. Removing one: delete the entry
 * and its checks; its stored setting is then ignored and drops out of the
 * admin page.
 */

export interface FeatureFlagDefinition {
  /** Shown on the admin Feature Flags page. */
  label: string;
  description: string;
}

export const FEATURE_FLAGS = {} satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlagName[];

export type FeatureFlagState = 'off' | 'selected' | 'everyone';

export const FEATURE_FLAG_STATES: readonly FeatureFlagState[] = ['off', 'selected', 'everyone'];

/** One admin change to a flag, applied by /api/admin/feature-flags. */
export type FeatureFlagChange =
  | { action: 'set-state'; state: FeatureFlagState }
  | { action: 'set-customers'; customerIds: string[] }
  | { action: 'clear-customers' };

/** A stored FeatureFlagSetting row; its id is the flag name. */
export interface FeatureFlagSettingRecord {
  id: string;
  state?: FeatureFlagState | null;
  /** Kept while the flag is Off, so switching back to Selected restores it. */
  selectedCustomerIds?: (string | null)[] | null;
  everyoneSince?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export function isFeatureFlagName(
  name: unknown,
  registered: readonly string[] = FEATURE_FLAG_NAMES
): name is FeatureFlagName {
  return typeof name === 'string' && registered.includes(name);
}

/**
 * The registered flags that are on for a Customer: state Everyone, or state
 * Selected with the Customer on the list. A flag with no stored setting is
 * Off. `registered` is only overridden by tests.
 */
export function resolveOnFlags(
  settings: readonly FeatureFlagSettingRecord[],
  customerId: string,
  registered: readonly string[] = FEATURE_FLAG_NAMES
): FeatureFlagName[] {
  if (!customerId) return [];
  return settings
    .filter((setting) => isFeatureFlagName(setting.id, registered))
    .filter(
      (setting) =>
        setting.state === 'everyone' ||
        (setting.state === 'selected' && (setting.selectedCustomerIds ?? []).includes(customerId))
    )
    .map((setting) => setting.id as FeatureFlagName);
}
