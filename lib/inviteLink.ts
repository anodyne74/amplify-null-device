/**
 * The sign-in link in an invitation email. It carries the invitee's Cognito
 * temporary password in the URL fragment instead of printing it in the email:
 * mail filters score an email that spells out credentials as phishing, and the
 * fragment is never sent to a server or logged. The home page reads it with
 * `parseInviteFragment`, signs in and asks for a new password.
 */
export function buildInviteUrl(baseUrl: string, email: string, temporaryPassword: string): string {
  const fragment = new URLSearchParams({ email, code: temporaryPassword });
  return `${baseUrl.replace(/\/$/, '')}/#invite&${fragment.toString()}`;
}

export function parseInviteFragment(hash: string): { email: string; temporaryPassword: string } | null {
  const [marker, ...rest] = hash.replace(/^#/, '').split('&');
  if (marker !== 'invite') return null;
  const params = new URLSearchParams(rest.join('&'));
  const email = params.get('email');
  const temporaryPassword = params.get('code');
  return email && temporaryPassword ? { email, temporaryPassword } : null;
}
