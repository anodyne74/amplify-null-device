import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomerUsersList, { type CustomerUsersListRow } from '../components/CustomerUsersList';
import { resendCustomerInvite, type ResendInviteOutcome } from '@/lib/customerInvite';

jest.mock('@/lib/customerInvite', () => ({
  resendCustomerInvite: jest.fn(),
}));

const mockResend = resendCustomerInvite as jest.MockedFunction<typeof resendCustomerInvite>;

const users: CustomerUsersListRow[] = [
  { id: 'cu-1', name: 'Pat Owner', email: 'pat@acme.test', role: 'account_owner', status: 'Active' },
  { id: 'cu-2', name: 'Kim Lee', email: 'kim@acme.test', role: 'read_only', status: 'Invite sent' },
];

function renderList(rows = users) {
  return render(<CustomerUsersList customerName="Acme Realty" users={rows} />);
}

describe('CustomerUsersList', () => {
  beforeEach(() => mockResend.mockReset());

  it("lists each Customer User's name, email, role and status", () => {
    renderList();

    const rows = within(screen.getByRole('table', { name: 'Customer Users' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Pat Owner');
    expect(rows[0]).toHaveTextContent('pat@acme.test');
    expect(rows[0]).toHaveTextContent('account owner');
    expect(rows[0]).toHaveTextContent('active');
    expect(rows[1]).toHaveTextContent('Kim Lee');
    expect(rows[1]).toHaveTextContent('read only');
    expect(rows[1]).toHaveTextContent('invite sent');
  });

  it('offers Resend invite only to Customer Users who have not signed in', () => {
    renderList();

    expect(screen.getByRole('button', { name: 'Resend invite to Kim Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend invite to Pat Owner' })).not.toBeInTheDocument();
  });

  it('offers no Resend invite when the sign-in status is unknown', () => {
    renderList([{ ...users[1], status: null }]);

    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resend invite/ })).not.toBeInTheDocument();
  });

  it('says when the Customer has no Customer Users', () => {
    renderList([]);

    expect(screen.getByText('No Customer Users yet.')).toBeInTheDocument();
  });

  it('resends with the Customer name and shows the success message', async () => {
    mockResend.mockResolvedValue({ ok: true, message: 'Invitation resent to kim@acme.test.' });
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Resend invite to Kim Lee' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Invitation resent to kim@acme.test.');
    expect(mockResend).toHaveBeenCalledWith({ email: 'kim@acme.test', name: 'Kim Lee' }, 'Acme Realty');
  });

  it('shows the email-not-sent message', async () => {
    mockResend.mockResolvedValue({
      ok: true,
      message: 'Invitation reset for kim@acme.test, but the email could not be sent. Ask them to use "Forgot password".',
    });
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Resend invite to Kim Lee' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Ask them to use "Forgot password".');
  });

  it("shows the API's error message", async () => {
    mockResend.mockResolvedValue({ ok: false, message: 'User has already signed in.' });
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Resend invite to Kim Lee' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('User has already signed in.');
  });

  it('disables the action while the resend is pending', async () => {
    let finish: (value: ResendInviteOutcome) => void = () => {};
    mockResend.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderList();

    const button = screen.getByRole('button', { name: 'Resend invite to Kim Lee' });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Resending...');
    fireEvent.click(button);
    expect(mockResend).toHaveBeenCalledTimes(1);

    finish({ ok: true, message: 'Invitation resent to kim@acme.test.' });
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
