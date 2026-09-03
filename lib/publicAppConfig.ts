// The app is deployed on two domains split by branch -- nulldevice.dev for
// `development`, nulldevice.com.au for `main`/production -- via a per-branch
// NEXT_PUBLIC_APP_URL override in Amplify Console. Rather than hardcoding
// either domain here, derive it from that same URL so these addresses always
// match whichever domain the branch is actually running on. Only falls back
// to nulldevice.com.au when NEXT_PUBLIC_APP_URL itself isn't set (e.g. local
// dev without env config).
function resolveAppDomain(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).host;
    } catch {
      // Malformed value -- fall through to the default below.
    }
  }
  return 'nulldevice.com.au';
}

export const APP_DOMAIN = resolveAppDomain();

export const BILLING_EMAIL = process.env.NEXT_PUBLIC_BILLING_EMAIL?.trim() || `billing@${APP_DOMAIN}`;
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || `support@${APP_DOMAIN}`;
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim() || `admin@${APP_DOMAIN}`;
