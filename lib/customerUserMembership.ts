/**
 * Who may be a Customer's Account Owner (see CONTEXT.md), and what a Customer
 * User row carries because of it. The one place that decides whether a
 * membership change is allowed and what it writes.
 *
 * - A Customer has at most one Account Owner, and no other Customer User can be
 *   added before there is one.
 * - The owner can't be made read-only; another user is promoted instead.
 * - Every row of a Customer carries the owner's sub as accountOwnerSub (see
 *   CustomerUser in amplify/data/resource.ts), so the owner's
 *   ownerDefinedIn('accountOwnerSub') grant resolves on all of them. A promotion
 *   therefore re-keys every other row.
 *
 * Pure: the admin users page applies a plan with the browser's data client, and
 * the invite route reads a new row's fields with the IAM client. Who may call
 * either is decided before they get here; saving, and the access sync that
 * follows (lib/customerAccess.ts), stay with the caller.
 */

export type MembershipRole = 'account_owner' | 'read_only';

/** A Customer User row, as far as these rules read it. */
export interface Member {
  id?: string | null;
  userSub?: string | null;
  role?: string | null;
  accountOwnerSub?: string | null;
}

function ownerOf(members: readonly Member[]): Member | undefined {
  return members.find((member) => member.role === 'account_owner');
}

/**
 * Why a user can't be added with this role, or null if they can. `userSub` is
 * who is being added, or undefined when they have no login yet (a new login is
 * never the existing owner).
 */
export function addMemberRefusal(
  members: readonly Member[],
  role: MembershipRole,
  userSub?: string | null
): string | null {
  const owner = ownerOf(members);
  if (role === 'read_only' && !owner) {
    return 'No account owner assigned for this customer yet. Assign a primary contact first.';
  }
  if (role === 'account_owner' && owner && owner.userSub !== userSub) {
    return 'This customer already has a primary contact. Remove the current owner before assigning a new one.';
  }
  return null;
}

/** The role and accountOwnerSub a new Customer User row is created with. */
export function newMemberFields(
  members: readonly Member[],
  role: MembershipRole,
  userSub: string
): { role: MembershipRole; accountOwnerSub: string } {
  return { role, accountOwnerSub: role === 'account_owner' ? userSub : ownerOf(members)?.userSub || userSub };
}

export type RoleChangePlan =
  | { ok: false; message: string }
  /**
   * `promoting`: the target becomes the owner, so its row is written with
   * accountOwnerSub = its own sub and `rekeyIds` (the other rows that carry
   * another sub) are written with the same value.
   */
  | { ok: true; promoting: boolean; ownerSub: string; rekeyIds: string[] };

/** Whether `target` may take `role`, and the writes a promotion needs. */
export function planRoleChange(members: readonly Member[], target: Member & { id: string }, role: MembershipRole): RoleChangePlan {
  const ownerSub = target.userSub ?? '';
  if (role === target.role) return { ok: true, promoting: false, ownerSub, rekeyIds: [] };

  if (role === 'account_owner') {
    const otherOwner = members.find((member) => member.role === 'account_owner' && member.id !== target.id);
    if (otherOwner) {
      return {
        ok: false,
        message: 'This customer already has a primary contact. Remove or change the current owner before assigning a new one.',
      };
    }
    const rekeyIds = members
      .filter((member) => member.id !== target.id && member.accountOwnerSub !== ownerSub)
      .map((member) => member.id)
      .filter((id): id is string => Boolean(id));
    return { ok: true, promoting: true, ownerSub, rekeyIds };
  }

  if (target.role === 'account_owner') {
    return { ok: false, message: 'Promote another user to primary contact before changing this one to read-only.' };
  }
  return { ok: true, promoting: false, ownerSub, rekeyIds: [] };
}
