const createCustomerUser = jest.fn();
const updateCustomerUser = jest.fn();
const deleteCustomerUser = jest.fn();
jest.mock('@/lib/customers', () => ({
  createCustomerUser: (...args: unknown[]) => createCustomerUser(...args),
  updateCustomerUser: (...args: unknown[]) => updateCustomerUser(...args),
  deleteCustomerUser: (...args: unknown[]) => deleteCustomerUser(...args),
}));
const callApiMock = jest.fn();
jest.mock('@/lib/apiClient', () => ({ callApi: (...args: unknown[]) => callApiMock(...args) }));

import { addMember, changeMember, removeMember, syncCustomerAccess } from '@/lib/customerUserAccess';

const SYNC = '/api/admin/sync-customer-access';
const syncCalls = () => callApiMock.mock.calls.filter(([path]) => path === SYNC);

const newMember = {
  customerId: 'cust-1',
  userSub: 'sub-new',
  role: 'read_only' as const,
  accountOwnerSub: 'sub-owner',
  name: 'New Person',
  email: 'new@agency.test',
  existing: false,
};

describe('customer user access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createCustomerUser.mockResolvedValue({ id: 'cu-new' });
    updateCustomerUser.mockResolvedValue({});
    deleteCustomerUser.mockResolvedValue({});
    callApiMock.mockResolvedValue({ success: true, complete: true, updated: { Route: 2 } });
  });

  describe('syncCustomerAccess', () => {
    it('starts progress at 0 and passes the change to the route', async () => {
      const onProgress = jest.fn();
      await expect(syncCustomerAccess('cust-1', { removed: 'sub-x' }, onProgress)).resolves.toEqual({ status: 'complete', updated: 2 });
      expect(callApiMock).toHaveBeenCalledWith(SYNC, { customerId: 'cust-1', removed: 'sub-x' });
      expect(onProgress.mock.calls).toEqual([[0], [2]]);
    });
  });

  describe('addMember', () => {
    it('saves the row, then syncs with the user as the added hint', async () => {
      const result = await addMember(newMember);

      expect(createCustomerUser).toHaveBeenCalledWith({
        customerId: 'cust-1',
        userSub: 'sub-new',
        role: 'read_only',
        accountOwnerSub: 'sub-owner',
        name: 'New Person',
        email: 'new@agency.test',
      });
      expect(syncCalls()).toEqual([[SYNC, { customerId: 'cust-1', added: 'sub-new' }]]);
      expect(result).toEqual({ saved: true, id: 'cu-new', created: true, sync: { status: 'complete', updated: 2 } });
    });

    it('does not save again for a user who already has a row, but still syncs', async () => {
      const result = await addMember({ ...newMember, existing: true });
      expect(createCustomerUser).not.toHaveBeenCalled();
      expect(syncCalls()).toHaveLength(1);
      expect(result).toMatchObject({ saved: true, created: false });
    });

    it('does not sync when the row cannot be saved', async () => {
      createCustomerUser.mockRejectedValue(new Error('denied'));
      await expect(addMember(newMember)).resolves.toEqual({ saved: false });
      expect(callApiMock).not.toHaveBeenCalled();
    });

    it('reports a sync that fails, with the row saved', async () => {
      callApiMock.mockRejectedValue(new Error('Access sync finished with 2 error(s).'));
      await expect(addMember(newMember)).resolves.toMatchObject({ saved: true, sync: { status: 'failed', message: 'Access sync finished with 2 error(s).' } });
    });
  });

  describe('removeMember', () => {
    const target = { id: 'cu-1', customerId: 'cust-1', userSub: 'sub-gone' };

    it('deletes the row, then syncs with the user as the removed hint', async () => {
      const result = await removeMember(target);
      expect(deleteCustomerUser).toHaveBeenCalledWith('cu-1');
      expect(syncCalls()).toEqual([[SYNC, { customerId: 'cust-1', removed: 'sub-gone' }]]);
      expect(result).toEqual({ removed: true, sync: { status: 'complete', updated: 2 } });
    });

    it('does not sync when the row cannot be deleted', async () => {
      deleteCustomerUser.mockRejectedValue(new Error('denied'));
      await expect(removeMember(target)).resolves.toEqual({ removed: false });
      expect(callApiMock).not.toHaveBeenCalled();
    });
  });

  describe('changeMember', () => {
    const plain = { ok: true as const, promoting: false, ownerSub: 'sub-1', rekeyIds: [] };
    const promotion = { ok: true as const, promoting: true, ownerSub: 'sub-1', rekeyIds: ['cu-2', 'cu-3'] };
    const base = { id: 'cu-1', customerId: 'cust-1', name: 'Ann', role: 'read_only' as const };

    it('saves a name or role change that alters nobody’s access without syncing', async () => {
      const result = await changeMember({ ...base, plan: plain });
      expect(updateCustomerUser).toHaveBeenCalledTimes(1);
      expect(updateCustomerUser).toHaveBeenCalledWith({ id: 'cu-1', name: 'Ann', role: 'read_only' });
      expect(callApiMock).not.toHaveBeenCalled();
      expect(result).toEqual({ saved: true, rekeyFailed: false, sync: null });
    });

    it('on a promotion re-keys the other rows to the new owner, then syncs the whole Customer', async () => {
      const order: string[] = [];
      updateCustomerUser.mockImplementation(async (input: { id: string }) => void order.push(`update:${input.id}`));
      callApiMock.mockImplementation(async () => {
        order.push('sync');
        return { complete: true, updated: {} };
      });

      const result = await changeMember({ ...base, role: 'account_owner', plan: promotion });

      expect(updateCustomerUser).toHaveBeenCalledWith({ id: 'cu-1', name: 'Ann', role: 'account_owner', accountOwnerSub: 'sub-1' });
      expect(updateCustomerUser).toHaveBeenCalledWith({ id: 'cu-2', accountOwnerSub: 'sub-1' });
      expect(updateCustomerUser).toHaveBeenCalledWith({ id: 'cu-3', accountOwnerSub: 'sub-1' });
      expect(order[order.length - 1]).toBe('sync');
      expect(syncCalls()).toEqual([[SYNC, { customerId: 'cust-1' }]]);
      expect(result).toEqual({ saved: true, rekeyFailed: false, sync: { status: 'complete', updated: 0 } });
    });

    it('reports a failed re-key together with the sync, which still runs', async () => {
      updateCustomerUser.mockImplementation(async (input: { id: string }) => {
        if (input.id === 'cu-3') throw new Error('denied');
      });
      const result = await changeMember({ ...base, role: 'account_owner', plan: promotion });
      expect(result).toMatchObject({ saved: true, rekeyFailed: true, sync: { status: 'complete' } });
      expect(syncCalls()).toHaveLength(1);
    });

    it('neither re-keys nor syncs when the row itself cannot be saved', async () => {
      updateCustomerUser.mockRejectedValue(new Error('denied'));
      await expect(changeMember({ ...base, role: 'account_owner', plan: promotion })).resolves.toEqual({ saved: false });
      expect(updateCustomerUser).toHaveBeenCalledTimes(1);
      expect(callApiMock).not.toHaveBeenCalled();
    });

    it('calls onSaved after the rows are saved and before the sync starts', async () => {
      const order: string[] = [];
      callApiMock.mockImplementation(async () => {
        order.push('sync');
        return { complete: true };
      });
      await changeMember({ ...base, role: 'account_owner', plan: promotion, onSaved: () => order.push('saved') });
      expect(order).toEqual(['saved', 'sync']);
    });
  });
});
