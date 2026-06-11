import { act, renderHook } from '@testing-library/react';
import { useCustomerOwnerState } from '@/app/administrator/customers/hooks/useCustomerOwnerState';

describe('useCustomerOwnerState', () => {
  it('opens and closes owner panel while resetting feedback and selection', () => {
    const { result } = renderHook(() => useCustomerOwnerState());

    act(() => {
      result.current.setOwnerError('error');
      result.current.setOwnerSuccess('success');
      result.current.setOwnerUserSub('sub-1');
      result.current.setOwnerName('Name');
      result.current.setOwnerEmail('email@example.com');
    });

    act(() => {
      result.current.openOwnerPanel('cust-1');
    });

    expect(result.current.expandedOwnerPanel).toBe('cust-1');
    expect(result.current.ownerError).toBeNull();
    expect(result.current.ownerSuccess).toBeNull();
    expect(result.current.ownerUserSub).toBe('');
    expect(result.current.ownerName).toBe('');
    expect(result.current.ownerEmail).toBe('');

    act(() => {
      result.current.closeOwnerPanel();
    });

    expect(result.current.expandedOwnerPanel).toBeNull();
  });

  it('selects user details when userSub matches and preserves values when it does not', () => {
    const { result } = renderHook(() => useCustomerOwnerState());

    const users = [
      {
        id: 'u-1',
        customerId: 'cust-1',
        userSub: 'sub-1',
        accountOwnerSub: 'sub-1',
        name: 'Jamie',
        email: 'jamie@example.com',
        role: 'read_only' as const,
      },
    ];

    act(() => {
      result.current.selectOwnerUserSub('sub-1', users);
    });

    expect(result.current.ownerUserSub).toBe('sub-1');
    expect(result.current.ownerName).toBe('Jamie');
    expect(result.current.ownerEmail).toBe('jamie@example.com');

    act(() => {
      result.current.selectOwnerUserSub('missing', users);
    });

    expect(result.current.ownerUserSub).toBe('missing');
    expect(result.current.ownerName).toBe('Jamie');
    expect(result.current.ownerEmail).toBe('jamie@example.com');
  });

  it('resets owner selection and feedback independently', () => {
    const { result } = renderHook(() => useCustomerOwnerState());

    act(() => {
      result.current.setOwnerUserSub('sub-1');
      result.current.setOwnerName('Jamie');
      result.current.setOwnerEmail('jamie@example.com');
      result.current.setOwnerError('error');
      result.current.setOwnerSuccess('success');
    });

    act(() => {
      result.current.resetOwnerSelection();
    });

    expect(result.current.ownerUserSub).toBe('');
    expect(result.current.ownerName).toBe('');
    expect(result.current.ownerEmail).toBe('');
    expect(result.current.ownerError).toBe('error');
    expect(result.current.ownerSuccess).toBe('success');

    act(() => {
      result.current.resetOwnerFeedback();
    });

    expect(result.current.ownerError).toBeNull();
    expect(result.current.ownerSuccess).toBeNull();
  });
});
