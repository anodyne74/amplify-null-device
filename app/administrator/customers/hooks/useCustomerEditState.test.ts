import { act, renderHook } from '@testing-library/react';
import { useCustomerEditState } from '@/app/administrator/customers/hooks/useCustomerEditState';

describe('useCustomerEditState', () => {
  it('opens panel and maps customer fields with defaults for optional values', () => {
    const { result } = renderHook(() => useCustomerEditState());

    act(() => {
      result.current.openEditPanel({
        customer: {
          id: 'cust-1',
          name: 'Acme',
          email: 'acme@example.com',
          billingRatePerHour: 95,
          status: undefined,
          companyName: undefined,
          addressLine1: undefined,
          standingInstructions: undefined,
          defaultNumberOfSigns: undefined,
          defaultAgentName: undefined,
          defaultAgentInitials: undefined,
        },
        billingRateDisplay: '$95.00',
        agentOptionsText: 'Jamie\nPat',
      });
    });

    expect(result.current.expandedEditPanel).toBe('cust-1');
    expect(result.current.editName).toBe('Acme');
    expect(result.current.editCompanyName).toBe('');
    expect(result.current.editEmail).toBe('acme@example.com');
    expect(result.current.editBillingRatePerHour).toBe('$95.00');
    expect(result.current.editStatus).toBe('active');
    expect(result.current.editAddressLine1).toBe('');
    expect(result.current.editStandingInstructions).toBe('');
    expect(result.current.editDefaultNumberOfSigns).toBe('');
    expect(result.current.editDefaultAgentName).toBe('');
    expect(result.current.editDefaultAgentInitials).toBe('');
    expect(result.current.editAgentOptionsText).toBe('Jamie\nPat');
  });

  it('maps numeric defaults and resets feedback on close', () => {
    const { result } = renderHook(() => useCustomerEditState());

    act(() => {
      result.current.setEditError('error');
      result.current.setEditSuccess('success');
      result.current.setEditResolvedAddress({
        latitude: 1,
        longitude: 2,
        formattedAddress: '123 Main St',
      });
    });

    act(() => {
      result.current.openEditPanel({
        customer: {
          id: 'cust-2',
          name: 'Beta',
          email: 'beta@example.com',
          billingRatePerHour: 110,
          status: 'inactive',
          defaultNumberOfSigns: 6,
          defaultAgentName: 'Taylor',
          defaultAgentInitials: 'TA',
        },
        billingRateDisplay: '$110.00',
        agentOptionsText: 'Taylor',
      });
    });

    expect(result.current.editDefaultNumberOfSigns).toBe('6');
    expect(result.current.editStatus).toBe('inactive');
    expect(result.current.editDefaultAgentName).toBe('Taylor');
    expect(result.current.editDefaultAgentInitials).toBe('TA');
    expect(result.current.editError).toBeNull();
    expect(result.current.editSuccess).toBeNull();
    expect(result.current.editResolvedAddress).toBeNull();

    act(() => {
      result.current.closeEditPanel();
    });

    expect(result.current.expandedEditPanel).toBeNull();
    expect(result.current.editError).toBeNull();
    expect(result.current.editSuccess).toBeNull();
    expect(result.current.editResolvedAddress).toBeNull();
  });
});
