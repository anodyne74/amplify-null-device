/**
 * Cognito Token Inspection Utilities
 * 
 * Use these functions to inspect and validate Cognito ID tokens
 * for debugging authentication and group membership issues
 */

/**
 * Decode a JWT token without verification (for inspection only)
 * WARNING: This does NOT verify the token signature - use only for inspection
 */
export function decodeJWT(token: string): Record<string, any> | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT format');
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    // Add padding if necessary
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    // Decode from base64
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

/**
 * Get and display the current user's ID token information
 * Useful for debugging authentication issues in the browser console
 */
export function inspectCurrentIdToken() {
  try {
    // Get token from localStorage (Amplify stores it there)
    const keys = Object.keys(localStorage);
    let idToken = null;

    // Look for Amplify token storage
    for (const key of keys) {
      if (key.includes('idToken') || key.includes('id_token')) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            idToken = parsed.toString ? parsed.toString() : parsed;
            break;
          } catch {
            idToken = value;
          }
        }
      }
    }

    if (!idToken) {
      console.warn('No ID token found in localStorage. User may not be authenticated.');
      return null;
    }

    const decoded = decodeJWT(idToken);
    if (!decoded) {
      console.error('Failed to decode ID token');
      return null;
    }

    console.log('ID Token Claims:', {
      sub: decoded.sub,
      email: decoded.email,
      email_verified: decoded.email_verified,
      groups: decoded['cognito:groups'],
      iss: decoded.iss,
      aud: decoded.aud,
      token_use: decoded.token_use,
      auth_time: new Date(decoded.auth_time * 1000).toISOString(),
      exp: new Date(decoded.exp * 1000).toISOString(),
    });

    return decoded;
  } catch (error) {
    console.error('Error inspecting ID token:', error);
    return null;
  }
}

/**
 * Check if current user is in a specific group
 */
export function isInGroup(groupName: string): boolean {
  const token = inspectCurrentIdToken();
  if (!token) return false;

  const groups = token['cognito:groups'] || [];
  return Array.isArray(groups) ? groups.includes(groupName) : false;
}

/**
 * Get all groups for current user
 */
export function getCurrentUserGroups(): string[] {
  const token = inspectCurrentIdToken();
  if (!token) return [];

  const groups = token['cognito:groups'] || [];
  return Array.isArray(groups) ? groups : [];
}

/**
 * Display user authentication status
 */
export function displayAuthStatus() {
  console.group('🔐 Authentication Status');

  const token = inspectCurrentIdToken();

  if (!token) {
    console.log('Status: Not authenticated');
    console.log('Action: Please log in first');
  } else {
    const groups = token['cognito:groups'] || [];
    console.log('Status: Authenticated');
    console.log('Email:', token.email);
    console.log('Groups:', groups.length > 0 ? groups : 'None');
    console.log('Token expires:', new Date(token.exp * 1000).toLocaleString());
  }

  console.groupEnd();
}

/**
 * Export token claims for debugging
 */
export function exportTokenForDebugging(): string {
  const token = inspectCurrentIdToken();
  if (!token) {
    return 'No token available';
  }

  return JSON.stringify(token, null, 2);
}

/**
 * Validate that token contains expected claims
 */
export function validateTokenClaims(): {
  valid: boolean;
  issues: string[];
} {
  const token = inspectCurrentIdToken();
  const issues: string[] = [];

  if (!token) {
    issues.push('No token found');
    return { valid: false, issues };
  }

  if (!token.email) {
    issues.push('Missing email claim');
  }

  if (!token.sub) {
    issues.push('Missing sub claim');
  }

  if (!token['cognito:groups']) {
    issues.push('Missing cognito:groups claim - check Cognito app client settings');
  } else if (!Array.isArray(token['cognito:groups']) || token['cognito:groups'].length === 0) {
    issues.push('User has no group membership - may need manual assignment');
  }

  const now = Math.floor(Date.now() / 1000);
  if (token.exp < now) {
    issues.push('Token is expired');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Print debugging checklist
 */
export function printDebuggingChecklist() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        Cognito Token Debugging Checklist                     ║
╚══════════════════════════════════════════════════════════════╝

In browser console, run:

1. Check authentication status:
   window.inspectCurrentIdToken()

2. View all claims:
   window.displayAuthStatus()

3. Validate token structure:
   window.validateTokenClaims()

4. Check specific group membership:
   window.isInGroup('operator')
   window.isInGroup('customer')

5. Get all user groups:
   window.getCurrentUserGroups()

Common Issues & Solutions:

❌ Token shows no 'cognito:groups' claim
✅ Fix: In AWS Console > Cognito > App Clients > ID Token
   Add claim: cognito:groups

❌ User in group but claim doesn't show
✅ Fix: Logout and login again to refresh token

❌ Auth fails immediately after signup
✅ Fix: Wait for email verification to complete

❌ Groups appear empty even after assignment
✅ Fix: Check IAM role permissions on the group
  `);
}
