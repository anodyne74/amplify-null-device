import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import outputs from '@/amplify_outputs.json';
import { createOrGetCognitoUser } from '@/app/api/admin/users/route';
import { sendInvitationEmail } from '@/lib/emails/invitationEmail';
import { listAll } from '@/lib/listAll';
import { syncCustomerAccess } from '@/lib/customerAccess';

const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] || '';
}

/**
 * Lets a customer account_owner invite a teammate ("agent") into their own
 * portal. Creates a real Cognito login (via the shared createOrGetCognitoUser
 * helper -- same one the admin invite flow uses) and a read_only CustomerUser
 * record. Runs with the SSR compute role's elevated data access (same pattern
 * as sync-profile-access) since CustomerUser's own authorization only grants
 * account_owner/read_only a `read` scope -- they cannot create CustomerUser
 * rows or call Cognito Admin* APIs from their own session.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'customer');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { claims, client } = auth;

    const body = (await request.json().catch(() => null)) as { email?: string; name?: string } | null;
    const rawEmail = body?.email?.trim();
    if (!rawEmail || !EMAIL_PATTERN.test(rawEmail)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }
    const normalizedEmail = rawEmail.toLowerCase();
    const name = body?.name?.trim() || undefined;

    // The caller's own CustomerUser row -- never trust a client-supplied customerId,
    // this is the only source of truth for which customer they belong to, and their
    // own role must be account_owner to invite anyone.
    const { data: ownRows } = await listAll(client, 'CustomerUser', {
      filter: { userSub: { eq: claims.sub } },
    });
    const ownRow = (ownRows || []).find((row) => row?.customerId);
    if (!ownRow?.customerId) {
      return NextResponse.json({ error: 'No customer mapping found for this user' }, { status: 404 });
    }
    if (ownRow.role !== 'account_owner') {
      return NextResponse.json({ error: 'Forbidden: only the account owner can invite teammates' }, { status: 403 });
    }
    const customerId = ownRow.customerId;

    const { data: customer } = await client.models.Customer.get({ id: customerId });
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (customer.restrictInvitesToOwnDomain) {
      const requiredDomain = emailDomain(customer.email || '');
      if (requiredDomain && emailDomain(normalizedEmail) !== requiredDomain) {
        return NextResponse.json(
          { error: `Invited emails must use the @${requiredDomain} domain.` },
          { status: 400 }
        );
      }
    }

    const { data: existingRows } = await listAll(client, 'CustomerUser', {
      filter: { customerId: { eq: customerId } },
    });
    const alreadyInvited = (existingRows || []).some(
      (row) => (row.email || '').trim().toLowerCase() === normalizedEmail
    );
    if (alreadyInvited) {
      return NextResponse.json({ error: 'This email has already been invited to your team.' }, { status: 409 });
    }

    const { sub, username, created: cognitoUserCreated, temporaryPassword } = await createOrGetCognitoUser({
      poolId: userPoolId!,
      email: normalizedEmail,
      name,
      groupName: 'customer',
      sendInvitationEmail: true,
    });
    if (!sub) {
      return NextResponse.json({ error: 'Could not create a login for this email.' }, { status: 500 });
    }

    const { data: created, errors } = await client.models.CustomerUser.create({
      customerId,
      userSub: sub,
      accountOwnerSub: claims.sub,
      role: 'read_only',
      name,
      email: normalizedEmail,
    });
    if (errors && errors.length > 0) {
      console.error('Errors creating CustomerUser:', errors);
      return NextResponse.json({ error: 'Failed to add teammate to your account.' }, { status: 500 });
    }

    // Errors are logged by the sync; the invite itself has succeeded, and the
    // teammate's next portal visit re-runs the sync (sync-profile-access).
    await syncCustomerAccess(client, customerId, { added: sub });

    let emailSent = false;
    if (cognitoUserCreated && temporaryPassword) {
      try {
        await sendInvitationEmail({
          toEmail: normalizedEmail,
          inviteeName: name,
          customerName: customer.companyName || customer.name || 'your team',
          inviterName: ownRow.name || 'A teammate',
          inviterEmail: ownRow.email || '',
          temporaryPassword,
        });
        emailSent = true;
      } catch (err) {
        // Non-blocking: the teammate's login and access are already set up.
        console.error('Failed to send branded invitation email:', err);
      }
    }

    return NextResponse.json({ success: true, user: { sub, username }, customerUser: created, emailSent });
  } catch (err) {
    console.error('Unexpected error in customer invite-user:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
