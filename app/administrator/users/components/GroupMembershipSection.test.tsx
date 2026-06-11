import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import GroupMembershipSection from '@/app/administrator/users/components/GroupMembershipSection';

describe('GroupMembershipSection', () => {
  it('renders nothing when no selected user', () => {
    const { container } = render(
      <GroupMembershipSection
        selectedUsername=""
        selectedCustomerId="cust-1"
        pending={false}
        groups={[]}
        groupOptions={['customer', 'operator', 'administrator']}
        onToggleGroup={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders user info, active groups, and disables customer toggle without selected customer', () => {
    render(
      <GroupMembershipSection
        selectedUsername="alice"
        selectedUser={{ name: 'Alice', email: 'alice@example.com' }}
        selectedCustomerId=""
        pending={false}
        groups={['operator']}
        groupOptions={['customer', 'operator', 'administrator']}
        onToggleGroup={jest.fn()}
      />
    );

    expect(screen.getByText('Name: Alice')).toBeInTheDocument();
    expect(screen.getByText('Email: alice@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Active groups')).toBeInTheDocument();
    expect(screen.getByText('To enable customer access, select a customer in the "Customer Access" section below first.')).toBeInTheDocument();

    expect(screen.getByLabelText('Assign customer group for alice')).toBeDisabled();
    expect(screen.getByLabelText('Remove operator group for alice')).not.toBeDisabled();
  });

  it('calls onToggleGroup with expected values when toggles change', () => {
    const onToggleGroup = jest.fn();

    render(
      <GroupMembershipSection
        selectedUsername="alice"
        selectedCustomerId="cust-1"
        pending={false}
        groups={[]}
        groupOptions={['customer', 'operator', 'administrator']}
        onToggleGroup={onToggleGroup}
      />
    );

    fireEvent.click(screen.getByLabelText('Assign customer group for alice'));
    expect(onToggleGroup).toHaveBeenCalledWith('customer', true);

    fireEvent.click(screen.getByLabelText('Assign operator group for alice'));
    expect(onToggleGroup).toHaveBeenCalledWith('operator', true);
  });
});
