import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { SUPPORT_EMAIL } from '@/lib/publicAppConfig';
import { customOutputs } from '@/lib/amplifyOutputsCustom';

/**
 * Sends the branded staff-invitation email (the `NullDeviceStaffInvitationTemplate`
 * SES template defined in amplify/backend.ts) for operator/administrator invites.
 * Callers own the temporary password: it is generated in createOrGetCognitoUser
 * with MessageAction:SUPPRESS so Cognito's built-in invitation email never goes
 * out for these invites either.
 *
 * Sibling of lib/emails/invitationEmail.ts (the customer-portal-flavored
 * equivalent) -- kept separate because the copy differs (no customerName, no
 * invoices) rather than reusing one template with role-conditional wording.
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
const fallbackStaffInvitationTemplateName = branchName
  ? `NullDeviceStaffInvitationTemplate-${branchName}`
  : 'NullDeviceStaffInvitationTemplate';
const staffInvitationTemplateName =
  process.env.SES_STAFF_INVITATION_TEMPLATE_NAME ||
  customOutputs.sesStaffInvitationTemplateName ||
  fallbackStaffInvitationTemplateName;

export interface StaffInvitationEmailInput {
  /** Recipient / invitee email address (also rendered in the credentials panel). */
  toEmail: string;
  /** Invitee display name for the greeting; falls back to "there". */
  inviteeName?: string;
  /** Human-readable role, e.g. "Operator" or "Administrator". */
  roleLabel: string;
  /** Who sent the invite (the admin acting on the invite). */
  inviterName: string;
  inviterEmail: string;
  /** The Cognito temporary password issued for this user. */
  temporaryPassword: string;
  /** Days the temporary password stays valid (Cognito default is 7). */
  expiryDays?: number;
}

/** Throws on SES failure -- callers decide whether to surface or swallow it. */
export async function sendStaffInvitationEmail(input: StaffInvitationEmailInput): Promise<void> {
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://nulldevice.com.au').replace(/\/$/, '');
  const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply@nulldevice.com.au';
  const supportMailto = `mailto:${SUPPORT_EMAIL}`;

  const templateData = {
    roleLabel: input.roleLabel,
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
    logoUrl: `${appBaseUrl}/logo.svg`,
    companyAddress: process.env.SES_COMPANY_ADDRESS?.trim() || 'Melbourne, Australia',
  };

  await sesClient.send(
    new SendTemplatedEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [input.toEmail] },
      Template: staffInvitationTemplateName,
      TemplateData: JSON.stringify(templateData),
    })
  );
}
