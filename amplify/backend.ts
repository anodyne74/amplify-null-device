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
	<body style="margin:0;padding:0;background:#070b14;color:#f5f5f5;font-family:Inter,Arial,sans-serif;">
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#070b14;padding:28px 0;">
			<tr>
				<td align="center">
					<table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;background:#101826;border:1px solid rgba(148,163,184,0.28);border-radius:14px;overflow:hidden;">
						<tr>
							<td style="padding:18px 24px;background:linear-gradient(135deg,#0f172a,#172554);border-bottom:1px solid rgba(148,163,184,0.35);">
								<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
									<tr>
										<td style="vertical-align:middle;">
											<img src="{{logoUrl}}" alt="NullDevice" width="156" style="display:block;width:156px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
										</td>
										<td style="vertical-align:middle;text-align:right;">
											<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#38bdf8;">NullDevice</div>
											<div style="margin-top:4px;font-size:22px;font-weight:700;color:#ffffff;">Invoice Summary</div>
										</td>
									</tr>
								</table>
							</td>
						</tr>
						<tr>
							<td style="padding:24px;">
								<p style="margin:0 0 16px 0;color:rgba(241,245,249,0.96);font-size:15px;line-height:1.6;">Hi {{customerName}},</p>
								<p style="margin:0 0 22px 0;color:rgba(226,232,240,0.78);font-size:14px;line-height:1.6;">Your latest NullDevice invoice is attached as a PDF and is also available via the secure link below.</p>

								<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid rgba(148,163,184,0.28);border-radius:10px;background:#0b1220;margin-bottom:20px;">
									<tr>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.2);font-size:13px;color:rgba(203,213,225,0.85);">Invoice #</td>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.2);font-size:13px;color:#ffffff;text-align:right;">{{invoiceNumber}}</td>
									</tr>
									<tr>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.2);font-size:13px;color:rgba(203,213,225,0.85);">Invoice Date</td>
										<td style="padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.2);font-size:13px;color:#ffffff;text-align:right;">{{invoiceDate}}</td>
									</tr>
									<tr>
										<td style="padding:12px 16px;font-size:13px;color:rgba(203,213,225,0.85);">Amount Due</td>
										<td style="padding:12px 16px;font-size:20px;font-weight:700;color:#22d3ee;text-align:right;">{{totalAmount}}</td>
									</tr>
								</table>

								<a href="{{pdfUrl}}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#22d3ee;color:#0b1120;text-decoration:none;font-size:13px;font-weight:700;">View Invoice Online</a>

								<p style="margin:24px 0 0 0;color:rgba(148,163,184,0.9);font-size:12px;line-height:1.5;">This is an automated message. Please do not reply.</p>
							</td>
						</tr>
						<tr>
							<td style="padding:14px 24px;background:#0b1220;border-top:1px solid rgba(148,163,184,0.2);font-size:11px;color:rgba(148,163,184,0.88);">&copy; {{year}} NullDevice. All rights reserved.</td>
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

// ── SES inbound email forwarder ──────────────────────────────────────────────
const forwarderStack = backend.createStack('ses-email-forwarder');

const inboundBucket = new Bucket(forwarderStack, 'InboundMailBucket', {
	bucketName: 'ses-inbound-nulldevice-dev',
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
	functionName: 'ses-forwarder-nulldevice-dev',
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
	ruleSetName: 'inbound-rule-set-nulldevice-dev',
});

new CfnReceiptRule(forwarderStack, 'SesReceiptRule', {
	ruleSetName: receiptRuleSet.ref,
	rule: {
		name: 'forward-specific-nulldevice-dev',
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
