import { buildPortalOptions, PORTAL_PATHS } from './portalRouting';

/**
 * Pure post-login redirect decision logic shared by the landing page and the
 * route-guard components (ProtectedRoute / OperatorRoute).
 *
 * These functions only DECIDE where a user should be sent — they perform no
 * navigation and use no hooks, so each call site keeps its own router/effect
 * wiring. Every function returns the destination path, or `null` when the
 * user may stay where they are.
 *
 * NOTE: the three call sites intentionally do NOT share a single tie-break
 * order for multi-group users:
 * - Landing page: a single group redirects straight to its portal; multiple
 *   groups show a portal selector (null here); no groups → pending approval.
 * - Customer routes (ProtectedRoute): non-customers are sent to operator
 *   first, then administrator (operator wins for operator+administrator).
 * - Operator routes (OperatorRoute): administrator-only users are sent to
 *   the admin portal, but dual admin+operator users may stay in operator mode.
 * - Admin routes (OperatorRoute requireAdmin): non-admins go to operator,
 *   then customer, then pending approval.
 * Do not unify these without an explicit behavior decision.
 */

export const PENDING_APPROVAL_PATH = '/pending-approval';

export interface RoleFlags {
  isAdmin: boolean;
  isOperator: boolean;
  isCustomer: boolean;
}

/**
 * Landing page (app/page.tsx) decision.
 * - exactly one portal role → that portal's path
 * - no portal roles → pending approval
 * - multiple portal roles → null (caller shows the portal selector)
 */
export function getLandingRedirect(groups: string[]): string | null {
  const options = buildPortalOptions(groups);
  if (options.length === 1) {
    return options[0].path;
  }
  if (options.length === 0) {
    return PENDING_APPROVAL_PATH;
  }
  return null;
}

/**
 * Customer-route guard (ProtectedRoute with requireCustomer) decision.
 * Customers stay; non-customers go to operator portal first, then admin
 * portal, otherwise pending approval.
 */
export function getCustomerRouteRedirect({ isAdmin, isOperator, isCustomer }: RoleFlags): string | null {
  if (isCustomer) {
    return null;
  }
  if (isOperator) {
    return PORTAL_PATHS.operator;
  }
  if (isAdmin) {
    return PORTAL_PATHS.administrator;
  }
  return PENDING_APPROVAL_PATH;
}

/**
 * Operator-route guard (OperatorRoute, requireAdmin=false) decision.
 * Admin-only users are sent to the admin portal, but dual-role
 * admin+operator users are allowed to stay in operator mode.
 */
export function getOperatorRouteRedirect({ isAdmin, isOperator, isCustomer }: RoleFlags): string | null {
  if (isAdmin && !isOperator) {
    return PORTAL_PATHS.administrator;
  }
  if (isOperator) {
    return null;
  }
  if (isCustomer) {
    return PORTAL_PATHS.customer;
  }
  return PENDING_APPROVAL_PATH;
}

/**
 * Admin-route guard (OperatorRoute, requireAdmin=true) decision.
 * Admins stay; everyone else goes to operator portal, then customer portal,
 * otherwise pending approval.
 */
export function getAdminRouteRedirect({ isAdmin, isOperator, isCustomer }: RoleFlags): string | null {
  if (isAdmin) {
    return null;
  }
  if (isOperator) {
    return PORTAL_PATHS.operator;
  }
  if (isCustomer) {
    return PORTAL_PATHS.customer;
  }
  return PENDING_APPROVAL_PATH;
}
