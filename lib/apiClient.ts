import { fetchAuthSession } from 'aws-amplify/auth';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Calls one of our own API routes (app/api/*) as the signed-in user — the
 * client half of lib/server/authorizeIamRequest.ts / verifyIamCaller.ts,
 * which check the Cognito ID token sent here as a Bearer header.
 *
 * POSTs `body` as JSON and resolves to the parsed JSON response. Throws an
 * ApiError instead when:
 * - there's no ID token (status 401, before any request is sent);
 * - the route responds non-2xx — the message is the route's `{ error }`, or
 *   "Request failed (status N)." when it sent none (e.g. a gateway's HTML
 *   error page).
 * A network failure rejects with fetch's own error.
 */
export async function callApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new ApiError('No session token found. Please sign in again.', 401);
  }

  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const routeError = typeof payload?.error === 'string' && payload.error ? payload.error : null;
    throw new ApiError(routeError ?? `Request failed (status ${response.status}).`, response.status);
  }
  return payload as T;
}
