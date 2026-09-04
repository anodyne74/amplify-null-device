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
        agentOptions: ['Jamie', 'Pat'],
      });
    });

    expect(result.current.expandedEditPanel).toBe('cust-1');
    expect(result.current.editName).toBe('Acme');
    expect(result.current.editCompanyName).toBe('');
    expect(result.current.editEmail).toBe('acme@example.com');
    expect(result.current.editContactPhone).toBe('');
    expect(result.current.editBillingRatePerHour).toBe('$95.00');
    expect(result.current.editStatus).toBe('active');
    expect(result.current.editAddressLine1).toBe('');
    expect(result.current.editStandingInstructions).toBe('');
    expect(result.current.editDefaultNumberOfSigns).toBe('');
    expect(result.current.editAgentOptions).toEqual(['Jamie', 'Pat']);
    expect(result.current.editOriginalAddressLine1).toBe('');
  });

  it('tracks the address the customer was opened with, for change detection (#58)', () => {
    const { result } = renderHook(() => useCustomerEditState());

    act(() => {
      result.current.openEditPanel({
        customer: {
          id: 'cust-3',
          name: 'Gamma',
          email: 'gamma@example.com',
          billingRatePerHour: 50,
          addressLine1: '11 Old St',
        },
        billingRateDisplay: '$50.00',
        agentOptions: [],
      });
    });

    expect(result.current.editAddressLine1).toBe('11 Old St');
    expect(result.current.editOriginalAddressLine1).toBe('11 Old St');

    act(() => {
      result.current.setEditAddressLine1('22 New Rd');
    });

    // Editing the field doesn't move the "original" marker — only re-opening the panel does.
    expect(result.current.editAddressLine1).toBe('22 New Rd');
    expect(result.current.editOriginalAddressLine1).toBe('11 Old St');
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
        agentOptions: ['Taylor'],
      });
    });

    expect(result.current.editDefaultNumberOfSigns).toBe('6');
    expect(result.current.editStatus).toBe('inactive');
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

  it('adds and removes agent option chips, de-duping case-insensitively', () => {
    const { result } = renderHook(() => useCustomerEditState());

    act(() => {
      result.current.addAgentOption('Betty O\'Shea');
    });
    expect(result.current.editAgentOptions).toEqual(['Betty O\'Shea']);

    act(() => {
      result.current.addAgentOption('betty o\'shea');
    });
    expect(result.current.editAgentOptions).toEqual(['Betty O\'Shea']);

    act(() => {
      result.current.addAgentOption('  ');
    });
    expect(result.current.editAgentOptions).toEqual(['Betty O\'Shea']);

    act(() => {
      result.current.addAgentOption('David Mun');
    });
    expect(result.current.editAgentOptions).toEqual(['Betty O\'Shea', 'David Mun']);

    act(() => {
      result.current.removeAgentOption('Betty O\'Shea');
    });
    expect(result.current.editAgentOptions).toEqual(['David Mun']);
  });

  it('reorders agent options — the first entry is the default agent', () => {
    const { result } = renderHook(() => useCustomerEditState());

    act(() => {
      result.current.addAgentOption('Betty O\'Shea');
      result.current.addAgentOption('David Mun');
    });
    expect(result.current.editAgentOptions).toEqual(['Betty O\'Shea', 'David Mun']);

    act(() => {
      result.current.moveAgentOption(1, 'up');
    });
    expect(result.current.editAgentOptions).toEqual(['David Mun', 'Betty O\'Shea']);

    // Already first — moving up further is a no-op.
    act(() => {
      result.current.moveAgentOption(0, 'up');
    });
    expect(result.current.editAgentOptions).toEqual(['David Mun', 'Betty O\'Shea']);
  });
});
