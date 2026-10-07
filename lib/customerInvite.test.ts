import { callApi } from '@/lib/apiClient';
import { customerInviteStatus, resendCustomerInvite } from '@/lib/customerInvite';

jest.mock('@/lib/apiClient', () => ({
  callApi: jest.fn(),
}));

const mockCallApi = callApi as jest.MockedFunction<typeof callApi>;

const user = { email: 'kim@acme.test', name: 'Kim Lee' };

describe('customerInviteStatus', () => {
  it('is "Invite sent" while the user still has their temporary password', () => {
    expect(customerInviteStatus('FORCE_CHANGE_PASSWORD')).toBe('Invite sent');
  });

  it.each(['CONFIRMED', 'RESET_REQUIRED', undefined])('is "Active" for %s', (status) => {
    expect(customerInviteStatus(status)).toBe('Active');
  });
});

describe('resendCustomerInvite', () => {
  beforeEach(() => mockCallApi.mockReset());

  it('calls resendInvite for the customer group with the Customer name', async () => {
    mockCallApi.mockResolvedValue({ emailSent: true });

    await resendCustomerInvite(user, 'Acme Realty');

    expect(mockCallApi).toHaveBeenCalledWith('/api/admin/users', {
      action: 'resendInvite',
      email: 'kim@acme.test',
      groupName: 'customer',
      name: 'Kim Lee',
      customerName: 'Acme Realty',
    });
  });

  it('reports the invitation resent when the email went', async () => {
    mockCallApi.mockResolvedValue({ emailSent: true });

    await expect(resendCustomerInvite(user, 'Acme Realty')).resolves.toEqual({
      ok: true,
      message: 'Invitation resent to kim@acme.test.',
    });
  });

  it('says to use "Forgot password" when the email could not be sent', async () => {
    mockCallApi.mockResolvedValue({ emailSent: false });

    await expect(resendCustomerInvite(user, 'Acme Realty')).resolves.toEqual({
      ok: true,
      message: 'Invitation reset for kim@acme.test, but the email could not be sent. Ask them to use "Forgot password".',
    });
  });

  it("passes on the API's error message", async () => {
    mockCallApi.mockRejectedValue(new Error('User has already signed in.'));

    await expect(resendCustomerInvite(user, 'Acme Realty')).resolves.toEqual({
      ok: false,
      message: 'User has already signed in.',
    });
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    mockCallApi.mockRejectedValue('boom');

    await expect(resendCustomerInvite(user, 'Acme Realty')).resolves.toEqual({
      ok: false,
      message: 'Failed to resend invite.',
    });
  });
});
