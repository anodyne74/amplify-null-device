import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Function as LambdaFunction, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { CfnTemplate, CfnReceiptRuleSet, CfnReceiptRule } from 'aws-cdk-lib/aws-ses';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { customerAccessActivation } from './functions/customer-access-activation/resource';
import { configureObservability } from './observability/resource';

const backend = defineBackend({ auth, data, storage, customerAccessActivation });

// Advanced security (AUDIT mode) is required for AdminListUserAuthEvents, which
// powers the admin Users page's "signed in past 7 days" stat. AUDIT only logs and
// risk-scores sign-in events -- it doesn't block or challenge users -- so it adds
// no sign-in friction, just the Cognito advanced security cost.
//
// AWS now gates any "Threat Protection" (formerly "advanced security") feature
// behind the Cognito Plus feature plan -- the pool defaults to Essentials, which
// rejects advancedSecurityMode outright ("features need to be disabled for the
// ESSENTIALS pricing tier configured: Threat Protection"). Plus is billed per
// MAU pool-wide, not just for this feature -- see https://aws.amazon.com/cognito/pricing/.
backend.auth.resources.cfnResources.cfnUserPool.userPoolTier = 'PLUS';
backend.auth.resources.cfnResources.cfnUserPool.userPoolAddOns = {
	advancedSecurityMode: 'AUDIT',
};

function sanitizeNamePart(value: string, fallback: string) {
	const cleaned = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
	return cleaned || fallback;
}

function withMaxLength(value: string, max: number) {
	return value.length <= max ? value : value.slice(0, max);
}

const branchName = sanitizeNamePart(process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || 'dev', 'dev');
// The app is deployed on two domains split by branch: nulldevice.com.au for
// `main`/production, nulldevice.dev for everything else (`development` and
// any preview branches). Used below for the SES inbound rule's recipient
// addresses -- those must match whichever domain the branch actually
// receives mail on, not be hardcoded to production's domain.
const emailDomain = branchName === 'main' ? 'nulldevice.com.au' : 'nulldevice.dev';

// Cognito's own emails (forgot-password codes, sign-up verification codes,
// admin-created-user temp passwords) default to its built-in "COGNITO_DEFAULT"
// sender (no-reply@verificationemail.com) unless told otherwise. That sender is
// capped at a low daily volume and is routinely spam-filtered or outright
// rejected by Microsoft-hosted mail (Outlook/Hotmail/Microsoft 365) -- so
// ForgotPassword reports success (Cognito accepted and "sent" the code) while
// the email never arrives. Route these through the same verified, DKIM-signed
// SES domain the rest of the app already sends invoices/invitations from.
const authStack = Stack.of(backend.auth.resources.userPool);
backend.auth.resources.cfnResources.cfnUserPool.emailConfiguration = {
	emailSendingAccount: 'DEVELOPER',
	from: `no-reply@${emailDomain}`,
	sourceArn: `arn:aws:ses:${authStack.region}:${authStack.account}:identity/${emailDomain}`,
	configurationSet: 'my-first-configuration-set',
};

const invoiceTemplateName = withMaxLength(`NullDeviceInvoiceTemplate-${branchName}`, 64);
const jobAssignedTemplateName = withMaxLength(`NullDeviceJobAssignedTemplate-${branchName}`, 64);
const welcomeTemplateName = withMaxLength(`NullDeviceWelcomeTemplate-${branchName}`, 64);
const invitationTemplateName = withMaxLength(`NullDeviceInvitationTemplate-${branchName}`, 64);
const staffInvitationTemplateName = withMaxLength(`NullDeviceStaffInvitationTemplate-${branchName}`, 64);
const inboundBucketName = withMaxLength(`ses-inbound-nulldevice-${branchName}`, 63);
const forwarderFunctionName = withMaxLength(`ses-forwarder-nulldevice-${branchName}`, 64);
const inboundRuleSetName = withMaxLength(`inbound-rule-set-nulldevice-${branchName}`, 64);
const inboundRuleName = withMaxLength(`forward-specific-nulldevice-${branchName}`, 64);

const sesStack = backend.createStack('ses-invoice-template');

new CfnTemplate(sesStack, 'InvoiceSummaryTemplate', {
	template: {
		templateName: invoiceTemplateName,
		subjectPart: 'Invoice {{invoiceNumber}} from NullDevice',
		htmlPart: `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Invoice {{invoiceNumber}}</title>
	</head>
	<body style="margin:0;padding:0;background:#F6F7FB;color:#2B3150;font-family:'Segoe UI',Arial,sans-serif;">
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F6F7FB;padding:28px 0;">
			<tr>
				<td align="center">
					<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#FFFFFF;border:1px solid #DFE2EE;border-radius:16px;overflow:hidden;">
						<tr>
							<td style="padding:22px 28px;background:#141B38;">
								<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
									<tr>
										<td style="vertical-align:middle;">
											<img src="{{logoUrl}}" alt="NullDevice" width="146" style="display:block;width:146px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
										</td>
										<td style="vertical-align:middle;text-align:right;">
											<div style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-weight:700;font-size:20px;color:#ffffff;">Invoice Summary</div>
										</td>
									</tr>
								</table>
							</td>
						</tr>
						<tr>
							<td style="padding:28px;">
								<p style="margin:0 0 16px 0;color:#2B3150;font-size:15px;line-height:1.6;">Hi {{customerName}},</p>
								<p style="margin:0 0 22px 0;color:#5A6180;font-size:14px;line-height:1.6;">Your latest NullDevice invoice is attached as a PDF and is also available via the secure link below.</p>

								<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #DFE2EE;border-radius:12px;margin-bottom:20px;">
									<tr>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#5A6180;">Invoice #</td>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#141B38;font-weight:600;text-align:right;">{{invoiceNumber}}</td>
									</tr>
									<tr>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#5A6180;">Invoice Date</td>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#141B38;font-weight:600;text-align:right;">{{invoiceDate}}</td>
									</tr>
									<tr>
										<td style="padding:14px 18px;font-size:15px;color:#141B38;font-weight:700;font-family:'Comfortaa','Trebuchet MS',sans-serif;">Amount Due</td>
										<td style="padding:14px 18px;font-size:17px;font-weight:700;color:#141B38;text-align:right;">{{totalAmount}}</td>
									</tr>
								</table>

								<a href="{{pdfUrl}}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#5D65E6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">View Invoice Online</a>

								<p style="margin:24px 0 0 0;color:#9AA0BA;font-size:12px;line-height:1.5;">This is an automated message. Please do not reply.</p>
							</td>
						</tr>
						<tr>
							<td style="padding:20px 28px;background:#F6F7FB;border-top:1px solid #DFE2EE;font-size:12px;color:#818AA4;line-height:1.7;">&copy; {{year}} NullDevice. All rights reserved.</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
`.trim(),
		textPart: `
NullDevice Invoice Summary

Hi {{customerName}},

Your invoice is attached as a PDF.

Invoice #: {{invoiceNumber}}
Invoice Date: {{invoiceDate}}
Amount Due: {{totalAmount}}

View online: {{pdfUrl}}

This is an automated message. Please do not reply.
`.trim(),
	},
});

new CfnTemplate(sesStack, 'JobAssignedTemplate', {
	template: {
		templateName: jobAssignedTemplateName,
		subjectPart: 'You’ve been assigned route {{routeCode}}',
		htmlPart: `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Route {{routeCode}} assigned</title>
	</head>
	<body style="margin:0;padding:0;background:#F6F7FB;color:#2B3150;font-family:'Segoe UI',Arial,sans-serif;">
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F6F7FB;padding:28px 0;">
			<tr>
				<td align="center">
					<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#FFFFFF;border:1px solid #DFE2EE;border-radius:16px;overflow:hidden;">
						<tr>
							<td style="padding:22px 28px;background:#141B38;">
								<img src="{{logoUrl}}" alt="NullDevice" width="146" style="display:block;width:146px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
							</td>
						</tr>
						<tr>
							<td style="padding:28px;">
								<div style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-weight:700;font-size:22px;color:#141B38;">Route {{routeCode}} is yours</div>
								<p style="margin:12px 0 0 0;color:#5A6180;font-size:15px;line-height:1.6;">Hi {{operatorName}}, you've been assigned to route {{routeCode}} for {{customerName}} — {{stopCount}} stops.</p>

								<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#EEF0FE;border-radius:12px;margin-top:20px;">
									<tr>
										<td style="padding:16px 18px;font-size:14px;color:#3A40A6;line-height:1.7;">
											<strong style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-size:15px;color:#141B38;">{{routeCode}}</strong><br />
											{{customerName}} · {{stopCount}} stops
										</td>
									</tr>
								</table>

								<a href="{{routeUrl}}" style="display:inline-block;margin-top:24px;padding:13px 26px;border-radius:999px;background:#5D65E6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">View route</a>

								<p style="margin:24px 0 0 0;color:#9AA0BA;font-size:12px;line-height:1.5;">This is an automated message. Please do not reply.</p>
							</td>
						</tr>
						<tr>
							<td style="padding:20px 28px;background:#F6F7FB;border-top:1px solid #DFE2EE;font-size:12px;color:#818AA4;line-height:1.7;">&copy; {{year}} NullDevice. All rights reserved.</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
`.trim(),
		textPart: `
Route {{routeCode}} is yours

Hi {{operatorName}}, you've been assigned to route {{routeCode}} for {{customerName}} — {{stopCount}} stops.

View route: {{routeUrl}}

This is an automated message. Please do not reply.
`.trim(),
	},
});

new CfnTemplate(sesStack, 'WelcomeTemplate', {
	template: {
		templateName: welcomeTemplateName,
		subjectPart: 'Your NullDevice portal is live',
		htmlPart: `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Your portal is live</title>
	</head>
	<body style="margin:0;padding:0;background:#F6F7FB;color:#2B3150;font-family:'Segoe UI',Arial,sans-serif;">
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F6F7FB;padding:28px 0;">
			<tr>
				<td align="center">
					<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#FFFFFF;border:1px solid #DFE2EE;border-radius:16px;overflow:hidden;">
						<tr>
							<td style="padding:22px 28px;background:#141B38;">
								<img src="{{logoUrl}}" alt="NullDevice" width="146" style="display:block;width:146px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
							</td>
						</tr>
						<tr>
							<td style="padding:0;">
								<div style="background:linear-gradient(45deg,#5D65E6,#B181E8);height:88px;"></div>
							</td>
						</tr>
						<tr>
							<td style="padding:28px 28px 8px 28px;">
								<div style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-weight:700;font-size:22px;color:#141B38;">Your portal is live</div>
								<p style="margin:12px 0 0 0;color:#5A6180;font-size:15px;line-height:1.6;">Welcome, {{customerName}}. Track your routes, sign placements and pickups, and invoices in one place — no more waiting on email updates.</p>
							</td>
						</tr>
						<tr>
							<td style="padding:24px 28px 32px 28px;">
								<a href="{{portalUrl}}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#5D65E6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Open my portal</a>
							</td>
						</tr>
						<tr>
							<td style="padding:20px 28px;background:#F6F7FB;border-top:1px solid #DFE2EE;font-size:12px;color:#818AA4;line-height:1.7;">&copy; {{year}} NullDevice. All rights reserved.</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
`.trim(),
		textPart: `
Your portal is live

Welcome, {{customerName}}. Track your routes, sign placements and pickups, and invoices in one place.

Open my portal: {{portalUrl}}

This is an automated message. Please do not reply.
`.trim(),
	},
});

new CfnTemplate(sesStack, 'InvitationTemplate', {
	template: {
		templateName: invitationTemplateName,
		subjectPart: "You've been invited to the {{customerName}} portal",
		htmlPart: `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>You've been invited to the {{customerName}} portal</title>
<!-- Brand faces where the client supports them (Apple Mail, iOS, Samsung); everything else falls back to the email-safe stack in each inline style. -->
<link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Manrope:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<!--[if mso]>
<style>body,table,td,a,p,div{font-family:Arial,Helvetica,sans-serif !important}</style>
<![endif]-->
<style>
  @media only screen and (max-width:600px){
    .nd-pad{padding-left:20px !important;padding-right:20px !important}
    .nd-cta a{display:block !important;text-align:center !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7FB;">
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">{{inviterName}} invited you to the {{customerName}} portal — sign in with your temporary password.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F6F7FB;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:560px;background-color:#FFFFFF;border:1px solid #E2E5EF;border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td width="560" style="width:560px;background-color:#141B38;background-image:linear-gradient(160deg,#141B38 0%,#2A2E76 100%);padding:13px 28px;" class="nd-pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="left" valign="middle" style="mso-line-height-rule:exactly;line-height:0;"><img src="{{logoUrl}}" alt="null device" width="224" height="100" style="display:block;width:224px;height:100px;max-width:224px;border:0;outline:none;text-decoration:none;"></td>
          <td align="right" valign="middle" style="font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:rgba(255,255,255,.66);mso-line-height-rule:exactly;line-height:100px;">Invitation</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:32px 28px 0;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;">
      <div style="font-family:Comfortaa,'Trebuchet MS',Tahoma,Arial,sans-serif;font-weight:bold;font-size:25px;line-height:33px;mso-line-height-rule:exactly;letter-spacing:-0.02em;color:#141B38;">You've been invited</div>
      <p style="margin:14px 0 0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#48526C;">
        Hi {{inviteeName}} — {{inviterDisplay}} has invited you to the <strong style="color:#141B38;">{{customerName}}</strong> portal on Null Device. Sign in with the temporary password below and you'll be asked to set your own.
      </p>
    </td>
  </tr>

  <!-- Credentials panel -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:24px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F6F7FB;border:1px solid #E2E5EF;border-radius:12px;">
        <tr>
          <td width="504" style="width:504px;padding:20px 24px;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;">
            <div style="font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:0.08em;text-transform:uppercase;color:#818AA4;font-weight:bold;">Email</div>
            <div style="font-family:'JetBrains Mono','Courier New',Courier,monospace;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#141B38;padding-top:4px;">{{inviteeEmail}}</div>
            <div style="font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:0.08em;text-transform:uppercase;color:#818AA4;font-weight:bold;padding-top:16px;">Temporary password</div>
            <div style="font-family:'JetBrains Mono','Courier New',Courier,monospace;font-size:19px;line-height:26px;mso-line-height-rule:exactly;font-weight:bold;color:#141B38;padding-top:4px;">{{temporaryPassword}}</div>
            <div style="font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#818AA4;padding-top:12px;">Single use · expires in {{expiryDays}} days</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Primary CTA -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:24px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="nd-cta" bgcolor="#5D65E6" style="border-radius:999px;">
            <a href="{{portalUrl}}" style="display:inline-block;padding:14px 30px;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Sign in</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Secondary action -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:16px 28px 0;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#818AA4;">
      Password expired or didn't work? <a href="{{resetPasswordUrl}}" style="color:#4B52C4;text-decoration:underline;font-weight:bold;">Request a new password</a>
    </td>
  </tr>

  <!-- Divider -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:28px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="height:1px;background-color:#E2E5EF;line-height:1px;font-size:0;">&nbsp;</td></tr></table>
    </td>
  </tr>

  <!-- What you can do -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:24px 28px 0;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;">
      <div style="font-family:Comfortaa,'Trebuchet MS',Tahoma,Arial,sans-serif;font-weight:bold;font-size:16px;line-height:22px;mso-line-height-rule:exactly;letter-spacing:-0.02em;color:#141B38;">What you can do in the portal</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
        <tr>
          <td width="10" valign="top" style="width:10px;padding:0 10px 8px 0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#5D65E6;font-weight:bold;">·</td>
          <td valign="top" style="padding:0 0 8px;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#48526C;">Track your routes and stop-by-stop progress</td>
        </tr>
        <tr>
          <td width="10" valign="top" style="width:10px;padding:0 10px 8px 0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#5D65E6;font-weight:bold;">·</td>
          <td valign="top" style="padding:0 0 8px;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#48526C;">See delivery history and performance for your sites</td>
        </tr>
        <tr>
          <td width="10" valign="top" style="width:10px;padding:0 10px 8px 0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#5D65E6;font-weight:bold;">·</td>
          <td valign="top" style="padding:0 0 8px;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#48526C;">Review invoices, if your account owner grants access</td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#818AA4;">Not expecting this? You can ignore this email, or contact us at <a href="{{supportUrl}}" style="color:#4B52C4;text-decoration:underline;">{{supportEmail}}</a>.</p>
    </td>
  </tr>

  <tr><td height="32" style="height:32px;line-height:32px;font-size:0;">&nbsp;</td></tr>

  <!-- Footer -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:20px 28px;background-color:#F6F7FB;border-top:1px solid #E2E5EF;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;mso-line-height-rule:exactly;color:#818AA4;">
      Null Device · {{companyAddress}}<br>
      <a href="{{portalUrl}}" style="color:#4B52C4;text-decoration:none;">Open portal</a> · <a href="{{supportUrl}}" style="color:#4B52C4;text-decoration:none;">Support</a> · <a href="{{unsubscribeUrl}}" style="color:#4B52C4;text-decoration:none;">Manage notifications</a><br>
      <span style="color:#9AA2B8;">You're receiving this because {{inviterName}} added you to the {{customerName}} account.</span>
    </td>
  </tr>

</table>

</td>
</tr>
</table>
</body>
</html>
`.trim(),
		textPart: `
You've been invited to the {{customerName}} portal

Hi {{inviteeName}},

{{inviterDisplay}} has invited you to the {{customerName}} portal on Null Device. Sign in with the temporary password below and you'll be asked to set your own.

Email: {{inviteeEmail}}
Temporary password: {{temporaryPassword}}
Single use - expires in {{expiryDays}} days.

Sign in: {{portalUrl}}
Password expired or didn't work? Request a new password: {{resetPasswordUrl}}

What you can do in the portal:
- Track your routes and stop-by-stop progress
- See delivery history and performance for your sites
- Review invoices, if your account owner grants access

Not expecting this? You can ignore this email, or contact us at {{supportEmail}}.

Null Device - {{companyAddress}}
`.trim(),
	},
});

// Staff (operator/administrator) equivalent of InvitationTemplate above -- same
// visual scaffold, but role-generic copy instead of customer-portal-flavored
// copy, since drivers/admins have no "customerName" and don't see invoices.
new CfnTemplate(sesStack, 'StaffInvitationTemplate', {
	template: {
		templateName: staffInvitationTemplateName,
		subjectPart: "You're invited to the Null Device {{roleLabel}} portal",
		htmlPart: `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>You're invited to the Null Device {{roleLabel}} portal</title>
<!-- Brand faces where the client supports them (Apple Mail, iOS, Samsung); everything else falls back to the email-safe stack in each inline style. -->
<link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Manrope:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<!--[if mso]>
<style>body,table,td,a,p,div{font-family:Arial,Helvetica,sans-serif !important}</style>
<![endif]-->
<style>
  @media only screen and (max-width:600px){
    .nd-pad{padding-left:20px !important;padding-right:20px !important}
    .nd-cta a{display:block !important;text-align:center !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7FB;">
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">{{inviterName}} invited you to Null Device as a {{roleLabel}} — sign in with your temporary password.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F6F7FB;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:560px;background-color:#FFFFFF;border:1px solid #E2E5EF;border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td width="560" style="width:560px;background-color:#141B38;background-image:linear-gradient(160deg,#141B38 0%,#2A2E76 100%);padding:13px 28px;" class="nd-pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="left" valign="middle" style="mso-line-height-rule:exactly;line-height:0;"><img src="{{logoUrl}}" alt="null device" width="224" height="100" style="display:block;width:224px;height:100px;max-width:224px;border:0;outline:none;text-decoration:none;"></td>
          <td align="right" valign="middle" style="font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:rgba(255,255,255,.66);mso-line-height-rule:exactly;line-height:100px;">Invitation</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:32px 28px 0;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;">
      <div style="font-family:Comfortaa,'Trebuchet MS',Tahoma,Arial,sans-serif;font-weight:bold;font-size:25px;line-height:33px;mso-line-height-rule:exactly;letter-spacing:-0.02em;color:#141B38;">You've been invited</div>
      <p style="margin:14px 0 0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#48526C;">
        Hi {{inviteeName}} — {{inviterDisplay}} has added you as a <strong style="color:#141B38;">{{roleLabel}}</strong> on Null Device. Sign in with the temporary password below and you'll be asked to set your own.
      </p>
    </td>
  </tr>

  <!-- Credentials panel -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:24px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F6F7FB;border:1px solid #E2E5EF;border-radius:12px;">
        <tr>
          <td width="504" style="width:504px;padding:20px 24px;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;">
            <div style="font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:0.08em;text-transform:uppercase;color:#818AA4;font-weight:bold;">Email</div>
            <div style="font-family:'JetBrains Mono','Courier New',Courier,monospace;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#141B38;padding-top:4px;">{{inviteeEmail}}</div>
            <div style="font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:0.08em;text-transform:uppercase;color:#818AA4;font-weight:bold;padding-top:16px;">Temporary password</div>
            <div style="font-family:'JetBrains Mono','Courier New',Courier,monospace;font-size:19px;line-height:26px;mso-line-height-rule:exactly;font-weight:bold;color:#141B38;padding-top:4px;">{{temporaryPassword}}</div>
            <div style="font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#818AA4;padding-top:12px;">Single use · expires in {{expiryDays}} days</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Primary CTA -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:24px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="nd-cta" bgcolor="#5D65E6" style="border-radius:999px;">
            <a href="{{portalUrl}}" style="display:inline-block;padding:14px 30px;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Sign in</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Secondary action -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:16px 28px 0;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#818AA4;">
      Password expired or didn't work? <a href="{{resetPasswordUrl}}" style="color:#4B52C4;text-decoration:underline;font-weight:bold;">Request a new password</a>
    </td>
  </tr>

  <!-- Divider -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:28px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="height:1px;background-color:#E2E5EF;line-height:1px;font-size:0;">&nbsp;</td></tr></table>
    </td>
  </tr>

  <!-- Reassurance -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:24px 28px 0;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#48526C;">
      Once you're signed in, your {{roleLabel}} portal will have everything you need to get started.
      <p style="margin:16px 0 0;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#818AA4;">Not expecting this? You can ignore this email, or contact us at <a href="{{supportUrl}}" style="color:#4B52C4;text-decoration:underline;">{{supportEmail}}</a>.</p>
    </td>
  </tr>

  <tr><td height="32" style="height:32px;line-height:32px;font-size:0;">&nbsp;</td></tr>

  <!-- Footer -->
  <tr>
    <td class="nd-pad" width="560" style="width:560px;padding:20px 28px;background-color:#F6F7FB;border-top:1px solid #E2E5EF;font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;mso-line-height-rule:exactly;color:#818AA4;">
      Null Device · {{companyAddress}}<br>
      <a href="{{portalUrl}}" style="color:#4B52C4;text-decoration:none;">Open portal</a> · <a href="{{supportUrl}}" style="color:#4B52C4;text-decoration:none;">Support</a><br>
      <span style="color:#9AA2B8;">You're receiving this because {{inviterName}} invited you to Null Device as a {{roleLabel}}.</span>
    </td>
  </tr>

</table>

</td>
</tr>
</table>
</body>
</html>
`.trim(),
		textPart: `
You're invited to the Null Device {{roleLabel}} portal

Hi {{inviteeName}},

{{inviterDisplay}} has added you as a {{roleLabel}} on Null Device. Sign in with the temporary password below and you'll be asked to set your own.

Email: {{inviteeEmail}}
Temporary password: {{temporaryPassword}}
Single use - expires in {{expiryDays}} days.

Sign in: {{portalUrl}}
Password expired or didn't work? Request a new password: {{resetPasswordUrl}}

Once you're signed in, your {{roleLabel}} portal will have everything you need to get started.

Not expecting this? You can ignore this email, or contact us at {{supportEmail}}.

Null Device - {{companyAddress}}
`.trim(),
	},
});

// customerAccessActivation sends the welcome email directly (SendTemplatedEmailCommand)
// on account_owner activation — grant its execution role SES send permission.
backend.customerAccessActivation.resources.lambda.addToRolePolicy(
	new PolicyStatement({
		sid: 'AllowSesSendTemplatedEmail',
		effect: Effect.ALLOW,
		actions: ['ses:SendTemplatedEmail'],
		resources: ['*'],
	}),
);

// Unlike the Next.js app compute, this function doesn't automatically inherit
// Amplify Console's app/branch-level environment variables -- without these,
// its handler falls back to an unbranded template name (which doesn't match
// the branch-suffixed template above, so the send silently fails) and a
// hardcoded nulldevice.com.au sender/link domain regardless of branch.
const customerAccessActivationLambda = backend.customerAccessActivation.resources.lambda as LambdaFunction;
customerAccessActivationLambda.addEnvironment('SES_WELCOME_TEMPLATE_NAME', welcomeTemplateName);
customerAccessActivationLambda.addEnvironment('SES_SENDER_EMAIL', `no-reply@${emailDomain}`);
customerAccessActivationLambda.addEnvironment('NEXT_PUBLIC_APP_URL', `https://${emailDomain}`);

// ── SES inbound email forwarder ──────────────────────────────────────────────
const forwarderStack = backend.createStack('ses-email-forwarder');

const inboundBucket = new Bucket(forwarderStack, 'InboundMailBucket', {
	bucketName: inboundBucketName,
	versioned: true,
	removalPolicy: RemovalPolicy.RETAIN,
});

inboundBucket.addToResourcePolicy(
	new PolicyStatement({
		sid: 'AllowSESPutObject',
		effect: Effect.ALLOW,
		principals: [new ServicePrincipal('ses.amazonaws.com')],
		actions: ['s3:PutObject'],
		resources: [inboundBucket.arnForObjects('*')],
		conditions: { StringEquals: { 'aws:Referer': forwarderStack.account } },
	}),
);

const forwarderRole = new Role(forwarderStack, 'SesForwarderRole', {
	assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
	managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
});

forwarderRole.addToPolicy(
	new PolicyStatement({
		sid: 'AllowReadEmailFromS3',
		effect: Effect.ALLOW,
		actions: ['s3:GetObject', 's3:GetObjectAcl'],
		resources: [inboundBucket.arnForObjects('*')],
	}),
);

forwarderRole.addToPolicy(
	new PolicyStatement({
		sid: 'AllowSesSendRawEmail',
		effect: Effect.ALLOW,
		actions: ['ses:SendRawEmail'],
		resources: ['*'],
	}),
);

const forwarderFunction = new LambdaFunction(forwarderStack, 'SesForwarderFunction', {
	functionName: forwarderFunctionName,
	runtime: Runtime.PYTHON_3_12,
	handler: 'index.lambda_handler',
	role: forwarderRole,
	timeout: Duration.seconds(30),
	environment: {
		BUCKET: inboundBucket.bucketName,
		FORWARD_TO: process.env.SES_FORWARD_TO ?? '',
	},
	code: Code.fromInline(`
import boto3
import email
import os

ses = boto3.client('ses')
s3 = boto3.client('s3')

BUCKET = os.environ['BUCKET']
FORWARD_TO = os.environ['FORWARD_TO']

def lambda_handler(event, context):
    record = event['Records'][0]
    message_id = record['ses']['mail']['messageId']
	# SES gives you the exact address that matched the rule
    inbound_address = record['ses']['receipt']['recipients'][0].lower()

	# Fetch raw email from S3
    obj = s3.get_object(Bucket=BUCKET, Key=message_id)
    raw = obj['Body'].read()

	# Parse message
    msg = email.message_from_bytes(raw)

   	# Preserve original sender
    original_from = msg.get('From')
	
   	# Rewrite From header to the inbound address (DMARC-safe)
    if 'From' in msg:
        msg.replace_header("From", inbound_address)
    else:
        msg['From'] = inbound_address

	# Rewrite From header to the inbound address (DMARC-safe)
    if original_from and not msg.get('Reply-To'):
        msg['Reply-To'] = original_from

    # Rewrite To header to your destination inbox
    if 'To' in msg:
        msg.replace_header("To", FORWARD_TO)
    else:
        msg['To'] = FORWARD_TO

	# Send via SES (SES will DKIM-sign using your domain)
    ses.send_raw_email(
        Source=inbound_address,
        Destinations=[FORWARD_TO],
        RawMessage={'Data': msg.as_bytes()}
    )

    return {'status': 'ok'}
`.trim()),
});

forwarderFunction.addPermission('AllowSESInvoke', {
	principal: new ServicePrincipal('ses.amazonaws.com'),
	sourceAccount: forwarderStack.account,
});

const receiptRuleSet = new CfnReceiptRuleSet(forwarderStack, 'SesReceiptRuleSet', {
	ruleSetName: inboundRuleSetName,
});

new CfnReceiptRule(forwarderStack, 'SesReceiptRule', {
	ruleSetName: receiptRuleSet.ref,
	rule: {
		name: inboundRuleName,
		enabled: true,
		tlsPolicy: 'Optional',
		recipients: [`admin@${emailDomain}`, `billing@${emailDomain}`, `support@${emailDomain}`],
		scanEnabled: true,
		actions: [
			{ s3Action: { bucketName: inboundBucket.bucketName } },
			{ lambdaAction: { functionArn: forwarderFunction.functionArn, invocationType: 'Event' } },
		],
	},
});

// ── Observability: dashboard + alarms ────────────────────────────────────────
configureObservability(backend, branchName);

// ── Runtime SES template names ───────────────────────────────────────────────
// AWS_BRANCH/AMPLIFY_BRANCH are only set during this CDK synth/build step --
// the deployed Next.js SSR runtime never sees them. lib/emails/*.ts and
// app/api/admin/send-invoice-email/route.ts read these back out of
// amplify_outputs.json instead of trying to reconstruct the branch suffix
// themselves at runtime (see lib/amplifyOutputsCustom.ts).
backend.addOutput({
	custom: {
		sesInvoiceTemplateName: invoiceTemplateName,
		sesInvitationTemplateName: invitationTemplateName,
		sesStaffInvitationTemplateName: staffInvitationTemplateName,
	},
});
