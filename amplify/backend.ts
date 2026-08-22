import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Function as LambdaFunction, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { CfnTemplate, CfnReceiptRuleSet, CfnReceiptRule } from 'aws-cdk-lib/aws-ses';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { customerAccessActivation } from './functions/customer-access-activation/resource';

const backend = defineBackend({ auth, data, storage, customerAccessActivation });

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
const invoiceTemplateName = withMaxLength(`NullDeviceInvoiceTemplate-${branchName}`, 64);
const jobAssignedTemplateName = withMaxLength(`NullDeviceJobAssignedTemplate-${branchName}`, 64);
const welcomeTemplateName = withMaxLength(`NullDeviceWelcomeTemplate-${branchName}`, 64);
const accountRequestNotifyTemplateName = withMaxLength(`NullDeviceAccountRequestNotifyTemplate-${branchName}`, 64);
const accountRequestRejectedTemplateName = withMaxLength(`NullDeviceAccountRequestRejectedTemplate-${branchName}`, 64);
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

new CfnTemplate(sesStack, 'AccountRequestNotifyTemplate', {
	template: {
		templateName: accountRequestNotifyTemplateName,
		subjectPart: 'New account request for {{customerName}}',
		htmlPart: `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>New account request</title>
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
							<td style="padding:28px 28px 8px 28px;">
								<div style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-weight:700;font-size:22px;color:#141B38;">New account request</div>
								<p style="margin:12px 0 0 0;color:#5A6180;font-size:15px;line-height:1.6;"><strong>{{requesterName}}</strong> ({{requesterEmail}}) has asked to join {{customerName}} on NullDevice as {{requestedRole}}. Review the request to grant or decline access.</p>
							</td>
						</tr>
						<tr>
							<td style="padding:24px 28px 32px 28px;">
								<a href="{{reviewUrl}}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#5D65E6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Review request</a>
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
New account request

{{requesterName}} ({{requesterEmail}}) has asked to join {{customerName}} on NullDevice as {{requestedRole}}.

Review request: {{reviewUrl}}

This is an automated message. Please do not reply.
`.trim(),
	},
});

new CfnTemplate(sesStack, 'AccountRequestRejectedTemplate', {
	template: {
		templateName: accountRequestRejectedTemplateName,
		subjectPart: 'Your request to join {{customerName}} was not approved',
		htmlPart: `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Request not approved</title>
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
							<td style="padding:28px 28px 8px 28px;">
								<div style="font-family:'Comfortaa','Trebuchet MS',sans-serif;font-weight:700;font-size:22px;color:#141B38;">Request not approved</div>
								<p style="margin:12px 0 0 0;color:#5A6180;font-size:15px;line-height:1.6;">Your request to join <strong>{{customerName}}</strong> on NullDevice was not approved.</p>
								<p style="margin:12px 0 0 0;color:#5A6180;font-size:15px;line-height:1.6;">{{decisionNote}}</p>
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
Request not approved

Your request to join {{customerName}} on NullDevice was not approved.

{{decisionNote}}

This is an automated message. Please do not reply.
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
		recipients: ['admin@nulldevice.dev', 'billing@nulldevice.dev', 'support@nulldevice.dev'],
		scanEnabled: true,
		actions: [
			{ s3Action: { bucketName: inboundBucket.bucketName } },
			{ lambdaAction: { functionArn: forwarderFunction.functionArn, invocationType: 'Event' } },
		],
	},
});
