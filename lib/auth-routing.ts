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
 * All guards share the same semantics:
 * - a user entitled to the portal they are visiting stays (null), and
 * - a user who does not belong is sent to their highest-precedence portal
 *   (administrator > operator > customer), or to pending approval when they
 *   hold no portal role.
 * The landing page is the one exception: multi-role users are shown a portal
 * selector there instead of being redirected (null from getLandingRedirect).
 */

export const PENDING_APPROVAL_PATH = '/pending-approval';

export interface RoleFlags {
  isAdmin: boolean;
  isOperator: boolean;
  isCustomer: boolean;
}

/**
 * Highest-precedence portal for a user: administrator > operator > customer,
 * falling back to pending approval for users with no portal role.
 */
export function getHomePortalPath({ isAdmin, isOperator, isCustomer }: RoleFlags): string {
  if (isAdmin) {
    return PORTAL_PATHS.administrator;
  }
  if (isOperator) {
    return PORTAL_PATHS.operator;
  }
  if (isCustomer) {
    return PORTAL_PATHS.customer;
  }
  return PENDING_APPROVAL_PATH;
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
 * Customers stay; everyone else goes to their highest-precedence portal.
 */
export function getCustomerRouteRedirect(flags: RoleFlags): string | null {
  if (flags.isCustomer) {
    return null;
  }
  return getHomePortalPath(flags);
}

/**
 * Operator-route guard (OperatorRoute, requireAdmin=false) decision.
 * Operators stay (including dual-role admin+operator users); everyone else
 * goes to their highest-precedence portal.
 */
export function getOperatorRouteRedirect(flags: RoleFlags): string | null {
  if (flags.isOperator) {
    return null;
  }
  return getHomePortalPath(flags);
}

/**
 * Admin-route guard (OperatorRoute, requireAdmin=true) decision.
 * Admins stay; everyone else goes to their highest-precedence portal.
 */
export function getAdminRouteRedirect(flags: RoleFlags): string | null {
  if (flags.isAdmin) {
    return null;
  }
  return getHomePortalPath(flags);
}
