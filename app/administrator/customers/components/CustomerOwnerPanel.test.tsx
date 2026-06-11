import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Customer, CustomerUser } from '@/app/administrator/customers/types';
import CustomerOwnerPanel from '@/app/administrator/customers/components/CustomerOwnerPanel';

const customer: Customer = {
  id: 'cust-1',
  name: 'Acme Corp',
  email: 'acme@example.com',
  billingRatePerHour: 100,
  status: 'active',
};

function makeUser(overrides: Partial<CustomerUser> = {}): CustomerUser {
  return {
    id: 'cu-1',
    customerId: 'cust-1',
    userSub: 'sub-1',
    accountOwnerSub: 'sub-owner',
    role: 'read_only',
    ...overrides,
  };
}

describe('CustomerOwnerPanel', () => {
  it('renders existing owner details and no assignment controls when owner exists', () => {
    render(
      <CustomerOwnerPanel
        customer={customer}
        ownerError={null}
        ownerSuccess={null}
        ownerSaving={false}
        ownerUserSub=""
        ownerName=""
        ownerEmail=""
        usersForCustomer={[]}
        existingOwner={makeUser({ role: 'account_owner', name: 'Jamie', email: 'jamie@example.com' })}
        onOwnerUserSubChange={jest.fn()}
        onAssignOwner={jest.fn()}
      />
    );

    expect(screen.getByText(/Owner assigned:/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign as Account Owner' })).not.toBeInTheDocument();
  });

  it('shows empty-state notice when no users are available', () => {
    render(
      <CustomerOwnerPanel
        customer={customer}
        ownerError=""
        ownerSuccess=""
        ownerSaving={false}
        ownerUserSub=""
        ownerName=""
        ownerEmail=""
        usersForCustomer={[]}
        onOwnerUserSubChange={jest.fn()}
        onAssignOwner={jest.fn()}
      />
    );

    expect(screen.getByText('No users in this customer group yet.')).toBeInTheDocument();
  });

  it('filters out existing account owner, previews selected user, and assigns owner', () => {
    const onOwnerUserSubChange = jest.fn();
    const onAssignOwner = jest.fn();

    render(
      <CustomerOwnerPanel
        customer={customer}
        ownerError="Validation issue"
        ownerSuccess="Saved"
        ownerSaving={false}
        ownerUserSub="sub-2"
        ownerName="Taylor"
        ownerEmail="taylor@example.com"
        usersForCustomer={[
          makeUser({ userSub: 'sub-owner', role: 'account_owner', name: 'Owner' }),
          makeUser({ userSub: 'sub-2', role: 'read_only', name: 'Taylor', email: 'taylor@example.com' }),
        ]}
        onOwnerUserSubChange={onOwnerUserSubChange}
        onAssignOwner={onAssignOwner}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Validation issue');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sub-2' } });
    expect(onOwnerUserSubChange).toHaveBeenCalledWith('sub-2');

    expect(screen.getByText(/Selected:/i)).toBeInTheDocument();
    expect(screen.getByText('taylor@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Assign as Account Owner' }));
    expect(onAssignOwner).toHaveBeenCalledTimes(1);
  });
});
