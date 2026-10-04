import { authorizeIamRequest, type CustomerCaller } from './authorizeIamRequest';
import type { IamDataClient } from './iamDataClient';
import type { VerifiedClaims } from './verifyIamCaller';
import { listAll } from '@/lib/listAll';
import type { Route } from '@/amplify/types';

/**
 * What both route-feedback endpoints start from: the customer caller, their
 * Route and whether it's been invoiced. A Route that isn't the caller's
 * Customer's, or that they aren't a viewer of, is "not found", never
 * "forbidden", so its existence doesn't leak -- as AppSync would answer.
 * Uses only the IAM client: a browser data module here would throw
 * NoValidAuthTokens.
 */
export async function loadFeedbackRoute(
  request: Request,
  routeId: unknown
): Promise<
  | {
      ok: true;
      caller: CustomerCaller;
      claims: VerifiedClaims & { sub: string };
      client: IamDataClient;
      route: Route;
      invoiced: boolean;
    }
  | { ok: false; status: number; error: string }
> {
  const auth = await authorizeIamRequest(request, 'customer');
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };
  if (typeof routeId !== 'string' || !routeId) return { ok: false, status: 400, error: 'routeId is required' };

  const { caller, claims, client } = auth;
  const { data: route, errors } = await client.models.Route.get({ id: routeId });
  if (errors?.length) {
    console.error('Reading the Route for feedback failed:', errors);
    return { ok: false, status: 500, error: 'Could not load the route.' };
  }
  if (!route || route.customerId !== caller.customerId || !route.viewerSubs?.includes(claims.sub)) {
    return { ok: false, status: 404, error: 'Route not found' };
  }

  const { data: invoices, errors: invoiceErrors } = await listAll(client, 'Invoice', { filter: { routeId: { eq: routeId } } });
  if (invoiceErrors.length > 0) {
    console.error("Reading the Route's invoices failed:", invoiceErrors);
    return { ok: false, status: 500, error: 'Could not check whether the route has been invoiced.' };
  }

  // The generated model type carries relationship loaders Route doesn't; only its fields are read.
  return { ok: true, caller, claims, client, route: route as unknown as Route, invoiced: invoices.length > 0 };
}
