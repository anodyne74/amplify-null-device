/**
 * The Missing Signs Report email (CONTEXT.md, #489), in the invoice email's
 * style. Filled from lib/missingSignsReport.ts's missingSignsReportEmail().
 * No link into the portal: billing CCs may have no login. Every value goes
 * through {{ }}, so SES escapes it.
 */
export const missingSignsReportTemplate = {
	subjectPart: 'Missing signs on Route {{routeCode}}',
	htmlPart: `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Missing signs on Route {{routeCode}}</title>
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
											<div style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-weight:700;font-size:20px;color:#ffffff;">Missing Signs</div>
										</td>
									</tr>
								</table>
							</td>
						</tr>
						<tr>
							<td style="padding:28px;">
								<p style="margin:0 0 16px 0;color:#2B3150;font-size:15px;line-height:1.6;">Hi {{customerName}},</p>
								<p style="margin:0 0 22px 0;color:#5A6180;font-size:14px;line-height:1.6;">When we collected the signs for Route {{routeCode}}, some couldn't be found:</p>

								<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #DFE2EE;border-radius:12px;">
									<tr>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#5A6180;">Placed</td>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#141B38;font-weight:600;text-align:right;">{{placedDate}}</td>
									</tr>
									<tr>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#5A6180;">Collected</td>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#141B38;font-weight:600;text-align:right;">{{collectedDate}}</td>
									</tr>
									{{#each properties}}
									<tr>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#141B38;">{{address}}</td>
										<td style="padding:14px 18px;border-bottom:1px solid #EDEFF6;font-size:14px;color:#141B38;font-weight:600;text-align:right;white-space:nowrap;">{{missingLabel}}</td>
									</tr>
									{{/each}}
									<tr>
										<td style="padding:14px 18px;font-size:15px;color:#141B38;font-weight:700;font-family:'Comfortaa','Trebuchet MS',sans-serif;">Total missing</td>
										<td style="padding:14px 18px;font-size:17px;font-weight:700;color:#141B38;text-align:right;white-space:nowrap;">{{totalLabel}}</td>
									</tr>
								</table>

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
NullDevice Missing Signs

Hi {{customerName}},

When we collected the signs for Route {{routeCode}}, some couldn't be found:

Placed: {{placedDate}}
Collected: {{collectedDate}}

{{#each properties}}
{{address}}: {{missingLabel}}
{{/each}}

Total missing: {{totalLabel}}

This is an automated message. Please do not reply.
`.trim(),
};
