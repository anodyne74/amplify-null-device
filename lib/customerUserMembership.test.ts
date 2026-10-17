import { addMemberRefusal, newMemberFields, planRoleChange, type Member } from './customerUserMembership';

const owner: Member & { id: string } = { id: 'r-owner', userSub: 'sub-owner', role: 'account_owner', accountOwnerSub: 'sub-owner' };
const reader: Member & { id: string } = { id: 'r-reader', userSub: 'sub-reader', role: 'read_only', accountOwnerSub: 'sub-owner' };
const other: Member & { id: string } = { id: 'r-other', userSub: 'sub-other', role: 'read_only', accountOwnerSub: 'sub-owner' };

describe('addMemberRefusal', () => {
  it('refuses a read-only user before there is an owner', () => {
    expect(addMemberRefusal([], 'read_only', 'sub-new')).toMatch(/No account owner/);
  });

  it('lets the first user in as the owner', () => {
    expect(addMemberRefusal([], 'account_owner', 'sub-new')).toBeNull();
  });

  it('refuses a second owner, but not the existing owner again', () => {
    expect(addMemberRefusal([owner], 'account_owner', 'sub-new')).toMatch(/already has a primary contact/);
    expect(addMemberRefusal([owner], 'account_owner', undefined)).toMatch(/already has a primary contact/);
    expect(addMemberRefusal([owner], 'account_owner', 'sub-owner')).toBeNull();
  });

  it('lets a read-only user in once there is an owner', () => {
    expect(addMemberRefusal([owner], 'read_only', 'sub-new')).toBeNull();
  });
});

describe('newMemberFields', () => {
  it('stamps an owner with their own sub', () => {
    expect(newMemberFields([], 'account_owner', 'sub-new')).toEqual({ role: 'account_owner', accountOwnerSub: 'sub-new' });
  });

  it('stamps a read-only user with the existing owner', () => {
    expect(newMemberFields([reader, owner], 'read_only', 'sub-new')).toEqual({ role: 'read_only', accountOwnerSub: 'sub-owner' });
  });

  it('falls back to their own sub when no owner is listed', () => {
    expect(newMemberFields([], 'read_only', 'sub-new').accountOwnerSub).toBe('sub-new');
  });
});

describe('planRoleChange', () => {
  it('changes nothing when the role is the same', () => {
    expect(planRoleChange([owner, reader], reader, 'read_only')).toMatchObject({ ok: true, promoting: false, rekeyIds: [] });
  });

  it('refuses a second owner', () => {
    const plan = planRoleChange([owner, reader], reader, 'account_owner');
    expect(plan).toMatchObject({ ok: false });
  });

  it('refuses to make the owner read-only', () => {
    const plan = planRoleChange([owner, reader], owner, 'read_only');
    expect(plan).toMatchObject({ ok: false, message: expect.stringMatching(/Promote another user/) });
  });

  it('demotes a non-owner without writes beyond their own', () => {
    expect(planRoleChange([owner, reader], reader, 'read_only')).toMatchObject({ ok: true, promoting: false });
  });

  it('does nothing for a user who is already the owner', () => {
    expect(planRoleChange([owner, reader], owner, 'account_owner')).toMatchObject({ ok: true, promoting: false, rekeyIds: [] });
  });

  it('promotes after the old owner has been demoted', () => {
    const rows = [{ ...owner, role: 'read_only' as const }, reader, other];
    const plan = planRoleChange(rows, reader, 'account_owner');
    expect(plan).toEqual({ ok: true, promoting: true, ownerSub: 'sub-reader', rekeyIds: ['r-owner', 'r-other'] });
  });

  it('skips rows already keyed to the new owner', () => {
    const rows = [{ ...owner, role: 'read_only' as const }, reader, { ...other, accountOwnerSub: 'sub-reader' }];
    expect(planRoleChange(rows, reader, 'account_owner')).toMatchObject({ rekeyIds: ['r-owner'] });
  });
});
