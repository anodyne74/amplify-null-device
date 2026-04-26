/**
 * Session utilities for customer authentication
 * Extract and verify current customer session
 */

/**
 * Get current authenticated customer from Cognito user
 * Extracts the customer identity from common Amplify/Cognito shapes.
 */
export function getCurrentCustomerId(user: any): string | undefined {
  if (!user) return undefined;

  return (
    user.userId ||
    user.sub ||
    user.signInUserSession?.idToken?.payload?.sub ||
    user.signInDetails?.loginId
  );
}

/**
 * Get current customer's email from authentication token
 */
export function getCurrentCustomerEmail(user: any): string | undefined {
  if (!user) return undefined;
  return user.signInUserSession?.idToken?.payload?.email;
}

/**
 * Verify that a given customer ID belongs to the current user
 * Used to prevent customers from accessing other customers' data
 */
export function verifyCustomerAccess(user: any, targetCustomerId: string): boolean {
  const currentCustomerId = getCurrentCustomerId(user);
  return currentCustomerId === targetCustomerId;
}

/**
 * Check if the current session is still valid
 * Cognito automatically refreshes tokens, so we just check if user exists
 */
export function isSessionValid(user: any): boolean {
  return !!getCurrentCustomerId(user);
}
