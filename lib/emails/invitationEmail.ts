import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { APP_DOMAIN, SUPPORT_EMAIL } from '@/lib/publicAppConfig';
import { customOutputs } from '@/lib/amplifyOutputsCustom';

/**
 * Sends the branded portal-invitation email (the `NullDeviceInvitationTemplate`
 * SES template defined in amplify/backend.ts). Callers own the temporary
 * password: it is generated in createOrGetCognitoUser with MessageAction:SUPPRESS
 * so Cognito's built-in invitation email never goes out for customer invites.
 *
 * Shared by the two customer-invite paths -- app/api/admin/users/route.ts
 * (createUser action) and app/api/customer/invite-user/route.ts -- to avoid a
 * third copy of the SendTemplatedEmailCommand boilerplate.
 */

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

function sanitizeNamePart(value: string, fallback: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

// process.env.AWS_BRANCH/AMPLIFY_BRANCH aren't set in the SSR runtime, so this
// reconstruction is a last-resort fallback -- see lib/amplifyOutputsCustom.ts.
const branchName = sanitizeNamePart(process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || '', '');
const fallbackInvitationTemplateName = branchName
  ? `NullDeviceInvitationTemplate-${branchName}`
  : 'NullDeviceInvitationTemplate';
const invitationTemplateName =
  process.env.SES_INVITATION_TEMPLATE_NAME ||
  customOutputs.sesInvitationTemplateName ||
  fallbackInvitationTemplateName;

export interface InvitationEmailInput {
  /** Recipient / invitee email address (also rendered in the credentials panel). */
  toEmail: string;
  /** Invitee display name for the greeting; falls back to "there". */
  inviteeName?: string;
  /** The customer account they've been invited to. */
  customerName: string;
  /** Who sent the invite (account owner, or the admin acting on their behalf). */
  inviterName: string;
  inviterEmail: string;
  /** The Cognito temporary password issued for this user. */
  temporaryPassword: string;
  /** Days the temporary password stays valid (Cognito default is 7). */
  expiryDays?: number;
}

/** Throws on SES failure -- callers decide whether to surface or swallow it. */
export async function sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || `https://${APP_DOMAIN}`).replace(/\/$/, '');
  const senderEmail = process.env.SES_SENDER_EMAIL || `no-reply@${APP_DOMAIN}`;
  const supportMailto = `mailto:${SUPPORT_EMAIL}`;

  const templateData = {
    customerName: input.customerName,
    inviterName: input.inviterName,
    inviterEmail: input.inviterEmail,
    inviteeName: input.inviteeName?.trim() || 'there',
    inviteeEmail: input.toEmail,
    temporaryPassword: input.temporaryPassword,
    expiryDays: String(input.expiryDays ?? 7),
    // The app's sign-in and forgot-password flows both live at the site root.
    portalUrl: `${appBaseUrl}/`,
    // No deep-link reset route -- a stuck invitee reaches a human.
    resetPasswordUrl: supportMailto,
    supportUrl: supportMailto,
    unsubscribeUrl: `${appBaseUrl}/customer/settings`,
    logoUrl: `${appBaseUrl}/logo.svg`,
    companyAddress: process.env.SES_COMPANY_ADDRESS?.trim() || 'Melbourne, Australia',
  };

  await sesClient.send(
    new SendTemplatedEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [input.toEmail] },
      Template: invitationTemplateName,
      TemplateData: JSON.stringify(templateData),
    })
  );
}
