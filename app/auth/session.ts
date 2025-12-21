/**
 * Session utilities for customer authentication
 * Extract and verify current customer session
 */

/**
 * Get current authenticated customer from Cognito user
 * Extracts the customer ID from the user's owner field
 */
export function getCurrentCustomerId(user: any): string | undefined {
  if (!user) return undefined;
  
  // In Amplify Data, the owner field is automatically set to the user's sub (subject)
  // We'll use the user's sub as the customer ID for owner-based queries
  return user.userId || user.sub;
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
  return !!user && !!user.userId;
}
