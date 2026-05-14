import { defineBackend } from '@aws-amplify/backend';
import { CfnTemplate } from 'aws-cdk-lib/aws-ses';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { customerAccessActivation } from './functions/customer-access-activation/resource';

const backend = defineBackend({ auth, data, storage, customerAccessActivation });

const sesStack = backend.createStack('ses-invoice-template');

new CfnTemplate(sesStack, 'InvoiceSummaryTemplate', {
	template: {
		templateName: 'NullDeviceInvoiceTemplate',
		subjectPart: 'Invoice {{invoiceNumber}} from NullDevice',
		htmlPart: `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Invoice {{invoiceNumber}}</title>
	</head>
	<body style="margin:0;padding:0;background:#0a0a0a;color:#f5f5f5;font-family:Inter,Arial,sans-serif;">
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0a;padding:24px 0;">
			<tr>
				<td align="center">
					<table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;background:#111111;border:1px solid rgba(255,255,255,0.15);border-radius:12px;overflow:hidden;">
						<tr>
							<td style="padding:18px 24px;background:#1a1a1a;border-bottom:1px solid rgba(255,255,255,0.15);">
								<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#00ff88;">NullDevice</div>
								<div style="margin-top:4px;font-size:22px;font-weight:700;color:#ffffff;">Invoice Summary</div>
							</td>
						</tr>
						<tr>
							<td style="padding:24px;">
								<p style="margin:0 0 16px 0;color:rgba(255,255,255,0.92);font-size:15px;line-height:1.6;">Hi {{customerName}},</p>
								<p style="margin:0 0 22px 0;color:rgba(255,255,255,0.6);font-size:14px;line-height:1.6;">Your latest invoice is attached as a PDF and also available from the secure link below.</p>

								<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid rgba(255,255,255,0.15);border-radius:8px;background:#0e0e0e;margin-bottom:20px;">
									<tr>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:rgba(255,255,255,0.6);">Invoice #</td>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:rgba(255,255,255,0.92);text-align:right;">{{invoiceNumber}}</td>
									</tr>
									<tr>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:rgba(255,255,255,0.6);">Invoice Date</td>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:rgba(255,255,255,0.92);text-align:right;">{{invoiceDate}}</td>
									</tr>
									<tr>
										<td style="padding:12px 16px;font-size:13px;color:rgba(255,255,255,0.6);">Amount Due</td>
										<td style="padding:12px 16px;font-size:20px;font-weight:700;color:#00ff88;text-align:right;">{{totalAmount}}</td>
									</tr>
								</table>

								<a href="{{pdfUrl}}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#00ff88;color:#0a0a0a;text-decoration:none;font-size:13px;font-weight:700;">View Invoice Online</a>

								<p style="margin:24px 0 0 0;color:rgba(255,255,255,0.38);font-size:12px;line-height:1.5;">This is an automated message. Please do not reply.</p>
							</td>
						</tr>
						<tr>
							<td style="padding:14px 24px;background:#0a0a0a;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:rgba(255,255,255,0.38);">&copy; {{year}} NullDevice. All rights reserved.</td>
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
