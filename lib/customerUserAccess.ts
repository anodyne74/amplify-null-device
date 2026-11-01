import { createCustomerUser, deleteCustomerUser, updateCustomerUser } from '@/lib/customers';
import { runAccessSync, type AccessSyncOutcome } from '@/lib/runAccessSync';
import type { MembershipRole, RoleChangePlan } from '@/lib/customerUserMembership';

/**
 * Changing who is a Customer's user, from the administrator's browser: save the
 * Customer User row, then run the Customer Access Sync (lib/customerAccess.ts)
 * so the records follow it. The rules for who may be an Account Owner, and what
 * a row carries, are lib/customerUserMembership.ts's; the caller has checked
 * them and passes what they decided. Nothing here speaks to the person: each
 * call returns what happened and the screen words it.
 *
 * - add and remove save the row, then sync with that user as the hint (the user
 *   list is eventually consistent, so the sync can't count on seeing the change).
 * - a promotion to Account Owner also re-keys the Customer's other rows to the
 *   new owner, then syncs, because the Customer record names its owner too and
 *   the old owner keeps that access until it is restamped. Any other change to
 *   a row alters nobody's access, so it doesn't sync.
 * - if the row can't be saved nothing syncs. A failed re-key doesn't stop the
 *   sync, and is reported with it.
 *
 * `onProgress` is called with the records updated so far, starting at 0 as the
 * sync begins (lib/runAccessSync.ts).
 */

type Progress = (updated: number) => void;

const SYNC_ROUTE = '/api/admin/sync-customer-access';

/** Re-stamps a Customer's records, for one that has just changed or to repair them. */
export function syncCustomerAccess(
  customerId: string,
  change: { added?: string; removed?: string } = {},
  onProgress?: Progress
): Promise<AccessSyncOutcome> {
  onProgress?.(0);
  return runAccessSync(SYNC_ROUTE, { customerId, ...change }, onProgress);
}

export type AddMemberResult =
  | { saved: false }
  | { saved: true; /** The new row's id; absent when the user already had one. */ id?: string; created: boolean; sync: AccessSyncOutcome };

/** Adds a user to a Customer, unless they already have a row, and syncs. */
export async function addMember(
  input: {
    customerId: string;
    userSub: string;
    role: MembershipRole;
    accountOwnerSub: string;
    name?: string;
    email: string;
    /** Whether the user already has a Customer User row here, so there is nothing to save. */
    existing: boolean;
  },
  onProgress?: Progress
): Promise<AddMemberResult> {
  let id: string | undefined;
  if (!input.existing) {
    try {
      const created = await createCustomerUser({
        customerId: input.customerId,
        userSub: input.userSub,
        role: input.role,
        accountOwnerSub: input.accountOwnerSub,
        name: input.name,
        email: input.email,
      });
      id = created?.id;
    } catch {
      return { saved: false };
    }
  }
  const sync = await syncCustomerAccess(input.customerId, { added: input.userSub }, onProgress);
  return { saved: true, id, created: !input.existing, sync };
}

export type RemoveMemberResult = { removed: false } | { removed: true; sync: AccessSyncOutcome };

/** Removes a user from a Customer and revokes their access. */
export async function removeMember(
  target: { id: string; customerId: string; userSub: string },
  onProgress?: Progress
): Promise<RemoveMemberResult> {
  try {
    await deleteCustomerUser(target.id);
  } catch {
    return { removed: false };
  }
  return { removed: true, sync: await syncCustomerAccess(target.customerId, { removed: target.userSub }, onProgress) };
}

export type ChangeMemberResult =
  | { saved: false }
  | {
      saved: true;
      /** Some of the Customer's other rows weren't moved to the new owner. */
      rekeyFailed: boolean;
      /** Only after a promotion; null when nobody's access changed. */
      sync: AccessSyncOutcome | null;
    };

/**
 * Changes a user's name and role; `plan` is the check planRoleChange made of the role.
 * `onSaved` is called once the rows are saved and before the sync starts, so the screen
 * can show the change while a long sync runs.
 */
export async function changeMember(
  input: {
    id: string;
    customerId: string;
    name?: string;
    role: MembershipRole;
    plan: Extract<RoleChangePlan, { ok: true }>;
    onSaved?: () => void;
  },
  onProgress?: Progress
): Promise<ChangeMemberResult> {
  const { plan } = input;
  try {
    await updateCustomerUser({
      id: input.id,
      name: input.name,
      role: input.role,
      ...(plan.promoting ? { accountOwnerSub: plan.ownerSub } : {}),
    });
  } catch {
    return { saved: false };
  }

  let rekeyFailed = false;
  if (plan.promoting) {
    const rekeys = await Promise.allSettled(plan.rekeyIds.map((id) => updateCustomerUser({ id, accountOwnerSub: plan.ownerSub })));
    rekeyFailed = rekeys.some((rekey) => rekey.status === 'rejected');
  }

  input.onSaved?.();
  const sync = plan.promoting ? await syncCustomerAccess(input.customerId, {}, onProgress) : null;
  return { saved: true, rekeyFailed, sync };
}
