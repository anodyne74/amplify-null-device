import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';

/**
 * Configure Amplify with the backend outputs
 * Should be called once in the app's root (e.g., layout.tsx or _app.tsx)
 */
export function configureAmplify() {
  Amplify.configure(outputs);
}

/**
 * Get the current user's groups/roles from the authentication token
 * Returns an array of group names (e.g., ['customer'] or ['operator'])
 *
 * @deprecated For Amplify v6, use fetchUserGroups() or the useUserGroups() hook.
 * This synchronous version only works when user has the v5 signInUserSession shape.
 */
export function getUserGroups(user: any): string[] {
  if (!user) return [];
  
  // Cognito groups are stored in the idToken's 'cognito:groups' claim
  const groups = user.signInUserSession?.idToken?.payload?.['cognito:groups'];
  return Array.isArray(groups) ? groups : [];
}

/**
 * Fetch the current user's Cognito groups from the active session token.
 * This is the Amplify v6-compatible version. Use this (or useUserGroups hook)
 * instead of the synchronous getUserGroups(user) when using aws-amplify v6.
 */
export async function fetchUserGroups(): Promise<string[]> {
  try {
    const session = await fetchAuthSession();
    const payload = session.tokens?.idToken?.payload;
    const groups = payload?.['cognito:groups'];
    return Array.isArray(groups) ? (groups as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Check if the current user is a customer (member of 'customer' group)
 * All authenticated users should be in at least the 'customer' group
 */
export function isCustomer(user: any): boolean {
  const groups = getUserGroups(user);
  return groups.includes('customer') || groups.length === 0; // Default to customer if no groups
}

/**
 * Check if the current user is an operator (member of 'operator' group)
 * Operators have elevated permissions for route management, billing, etc.
 */
export function isOperator(user: any): boolean {
  const groups = getUserGroups(user);
  return groups.includes('operator') || groups.includes('administrator');
}

/**
 * Check if the current user is an admin (in operator group with admin role)
 * Note: Specific role (admin/manager/staff) should be stored in custom attributes
 * or in a separate database table
 */
export function isAdmin(user: any): boolean {
  const groups = getUserGroups(user);
  return groups.includes('administrator');
}

/**
 * Get the current authenticated user's email
 */
export function getUserEmail(user: any): string | undefined {
  if (!user) return undefined;
  return user.signInUserSession?.idToken?.payload?.email;
}

/**
 * Get the current authenticated user's username
 */
export function getUsername(user: any): string | undefined {
  if (!user) return undefined;
  return user.username || user.signInUserSession?.idToken?.payload?.sub;
}

/**
 * Check if a user has a specific group
 */
export function hasGroup(user: any, groupName: string): boolean {
  const groups = getUserGroups(user);
  return groups.includes(groupName);
}
