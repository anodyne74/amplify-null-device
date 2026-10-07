import { callApi } from '@/lib/apiClient';

export type CustomerInviteStatus = 'Active' | 'Invite sent';

/**
 * A Customer User is "Invite sent" until they first sign in with their
 * temporary password (Cognito FORCE_CHANGE_PASSWORD), the same test as
 * getUserActivityStats' pendingInvites. Only those can have their invite resent.
 */
export function customerInviteStatus(cognitoStatus: string | undefined): CustomerInviteStatus {
  return cognitoStatus === 'FORCE_CHANGE_PASSWORD' ? 'Invite sent' : 'Active';
}

export type ResendInviteOutcome = { ok: boolean; message: string };

/**
 * Resends a Customer User's invitation through the admin users API, and
 * returns the message to show rather than throwing.
 */
export async function resendCustomerInvite(
  user: { email: string; name: string },
  customerName: string
): Promise<ResendInviteOutcome> {
  try {
    const payload = await callApi('/api/admin/users', {
      action: 'resendInvite',
      email: user.email,
      groupName: 'customer',
      name: user.name,
      customerName,
    });
    return {
      ok: true,
      message: payload.emailSent
        ? `Invitation resent to ${user.email}.`
        : `Invitation reset for ${user.email}, but the email could not be sent. Ask them to use "Forgot password".`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed to resend invite.' };
  }
}
