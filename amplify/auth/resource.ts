import { defineAuth } from '@aws-amplify/backend';
import { customerAccessActivation } from '../functions/customer-access-activation/resource';
import { operatorStatusActivation } from '../functions/operator-status-activation/resource';
import { emailDomain } from '../shared/branch';

const logoUrl = `https://${emailDomain}/logo.svg`;

/**
 * Define and configure your auth resource
 * Supports email-based authentication with custom attributes for role management
 * and Cognito user groups for role-based access control
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'Your NullDevice verification code',
      // Cognito sends this itself (via the SES DEVELOPER config in backend.ts)
      // rather than through one of the SendTemplatedEmail SES templates there,
      // so it can't use {{mergeFields}} -- everything is a plain string baked
      // in at synth time, and createCode() must be called at least once or
      // Amplify throws at build time.
      verificationEmailBody: (createCode) => `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Your verification code</title>
	</head>
	<body style="margin:0;padding:0;background:#F6F7FB;color:#2B3150;font-family:'Segoe UI',Arial,sans-serif;">
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F6F7FB;padding:28px 0;">
			<tr>
				<td align="center">
					<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#FFFFFF;border:1px solid #DFE2EE;border-radius:16px;overflow:hidden;">
						<tr>
							<td style="padding:22px 28px;background:#141B38;">
								<img src="${logoUrl}" alt="NullDevice" width="146" style="display:block;width:146px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
							</td>
						</tr>
						<tr>
							<td style="padding:28px;">
								<div style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-weight:700;font-size:22px;color:#141B38;">Verify your account</div>
								<p style="margin:12px 0 0 0;color:#5A6180;font-size:15px;line-height:1.6;">The verification code to your new account is:</p>

								<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#EEF0FE;border-radius:12px;margin-top:20px;">
									<tr>
										<td align="center" style="padding:22px 18px;">
											<span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#141B38;">${createCode()}</span>
										</td>
									</tr>
								</table>

								<p style="margin:24px 0 0 0;color:#9AA0BA;font-size:12px;line-height:1.5;">If you didn't request this code, you can safely ignore this email.</p>
							</td>
						</tr>
						<tr>
							<td style="padding:20px 28px;background:#F6F7FB;border-top:1px solid #DFE2EE;font-size:12px;color:#818AA4;line-height:1.7;">&copy; ${new Date().getFullYear()} NullDevice. All rights reserved.</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
`.trim(),
    },
  },
  triggers: {
    postConfirmation: customerAccessActivation,
    postAuthentication: operatorStatusActivation,
  },
  /**
   * Cognito User Groups:
   * - administrator: superusers with full access; must be added manually by an admin
   * - operator: staff members; must be added manually by an admin
   * - customer: assigned by an administrator when a signup request is approved
   *
   * Order matters: Amplify assigns group precedence by array index (lower index =
   * lower precedence number = higher priority). If a user ever ends up in more than
   * one group, the Identity Pool grants AWS credentials for exactly one group's IAM
   * role — the one with the lowest precedence number. Listing groups most-privileged
   * first ensures a multi-group user always resolves to their highest-privilege role,
   * rather than silently being downgraded to e.g. read-only customer S3 permissions.
   */
  groups: ['administrator', 'operator', 'customer'],
});

