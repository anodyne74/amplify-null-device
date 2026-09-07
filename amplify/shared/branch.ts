function sanitizeNamePart(value: string, fallback: string) {
	const cleaned = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
	return cleaned || fallback;
}

export const branchName = sanitizeNamePart(process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || 'dev', 'dev');

// The app is deployed on two domains split by branch: nulldevice.com.au for
// `main`/production, nulldevice.dev for everything else (`development` and
// any preview branches). Shared by backend.ts (SES inbound rules, SES sender
// identity) and auth/resource.ts (Cognito verification email branding) so the
// two never drift out of sync on which domain a branch actually receives on.
export const emailDomain = branchName === 'main' ? 'nulldevice.com.au' : 'nulldevice.dev';
