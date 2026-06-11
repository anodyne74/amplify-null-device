import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';

type AuthOutput = {
  user_pool_id?: string;
  user_pool_client_id?: string;
  identity_pool_id?: string;
  aws_region?: string;
};

type AmplifyOutputsShape = {
  auth?: AuthOutput;
  [key: string]: unknown;
};

let amplifyConfigured = false;

function readPublicAuthEnv() {
  const fromProcess = typeof process !== 'undefined' ? process.env : undefined;

  return {
    user_pool_id:
      fromProcess?.NEXT_PUBLIC_AMPLIFY_COGNITO_USER_POOL_ID ||
      fromProcess?.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    user_pool_client_id:
      fromProcess?.NEXT_PUBLIC_AMPLIFY_COGNITO_CLIENT_ID ||
      fromProcess?.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    identity_pool_id:
      fromProcess?.NEXT_PUBLIC_AMPLIFY_IDENTITY_POOL_ID ||
      fromProcess?.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID,
    aws_region:
      fromProcess?.NEXT_PUBLIC_AWS_REGION ||
      fromProcess?.NEXT_PUBLIC_COGNITO_REGION ||
      fromProcess?.NEXT_PUBLIC_API_REGION,
  };
}

function withAuthOverrides(baseOutputs: AmplifyOutputsShape): AmplifyOutputsShape {
  const overrides = readPublicAuthEnv();
  const hasOverride = Object.values(overrides).some((value) => Boolean(value));

  if (!hasOverride) {
    return baseOutputs;
  }

  return {
    ...baseOutputs,
    auth: {
      ...(baseOutputs.auth ?? {}),
      ...(overrides.user_pool_id ? { user_pool_id: overrides.user_pool_id } : {}),
      ...(overrides.user_pool_client_id ? { user_pool_client_id: overrides.user_pool_client_id } : {}),
      ...(overrides.identity_pool_id ? { identity_pool_id: overrides.identity_pool_id } : {}),
      ...(overrides.aws_region ? { aws_region: overrides.aws_region } : {}),
    },
  };
}

export function getAmplifyConfig(): AmplifyOutputsShape {
  return withAuthOverrides(outputs as AmplifyOutputsShape);
}

/**
 * Configure Amplify with the backend outputs
 * Should be called once in the app's root (e.g., layout.tsx or _app.tsx)
 */
export function configureAmplify() {
  if (amplifyConfigured) {
    return;
  }

  const config = getAmplifyConfig();
  const auth = config.auth ?? {};

  if (!auth.user_pool_id || !auth.user_pool_client_id) {
    console.error('Amplify auth config is missing user pool values.', {
      hasUserPoolId: Boolean(auth.user_pool_id),
      hasUserPoolClientId: Boolean(auth.user_pool_client_id),
      hasIdentityPoolId: Boolean(auth.identity_pool_id),
      region: auth.aws_region,
    });
  }

  Amplify.configure(config);
  amplifyConfigured = true;
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
  return groups.includes('customer');
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
  return user.signInDetails?.loginId || user.signInUserSession?.idToken?.payload?.email;
}

/**
 * Get the current authenticated user's username
 */
export function getUsername(user: any): string | undefined {
  if (!user) return undefined;
  return user.username || user.userId || user.signInUserSession?.idToken?.payload?.sub;
}

/**
 * Get a display-friendly user name, preferring Cognito first name claim.
 */
export function getUserDisplayName(user: any): string | undefined {
  if (!user) return undefined;

  const firstName =
    user.attributes?.given_name ||
    user.signInUserSession?.idToken?.payload?.given_name;
  if (typeof firstName === 'string' && firstName.trim()) {
    return firstName.trim();
  }

  return getUserEmail(user) || getUsername(user);
}

/**
 * Check if a user has a specific group
 */
export function hasGroup(user: any, groupName: string): boolean {
  const groups = getUserGroups(user);
  return groups.includes(groupName);
}
