/**
 * A Route's Route Request and Route Amendments as its Customer reads them
 * (#360, ADR 0008). Customers have no AppSync access to the records; both
 * calls go through API routes that check the caller's Customer owns the Route.
 */

import { callApi } from '@/lib/apiClient';
import type { CustomerRouteRequest } from '@/lib/customerRouteRequestView';

export type { CustomerRouteRequest, CustomerRouteRequestAttachment } from '@/lib/customerRouteRequestView';

/** The Route's Route Request first, then its Amendments in the order sent. */
export async function listCustomerRouteRequests(routeId: string): Promise<CustomerRouteRequest[]> {
  return (await callApi<{ requests: CustomerRouteRequest[] }>('/api/route-requests/for-route', { routeId })).requests;
}

/** A few-minute download link to one of a record's attachments, by position. */
export async function downloadCustomerRouteRequestFile(requestId: string, attachment: number): Promise<string> {
  return (await callApi<{ url: string }>('/api/route-requests/download', { requestId, attachment })).url;
}
