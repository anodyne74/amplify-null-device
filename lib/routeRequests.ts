/**
 * Route Requests (#358, ADR 0008) as the administrator inbox reads and writes
 * them: every email captured from requests@, newest first, with its flags and
 * suggested Customer; dismissing one with a reason; and links to its files,
 * which only the Route Request file API can hand out.
 */

import type { Schema } from '@/amplify/data/resource';
import { fetchUserId } from '@/lib/amplify-config';
import { callApi } from '@/lib/apiClient';
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export type RouteRequestEmail = Schema['RouteRequestEmail']['type'];

export interface RouteRequestRow {
  request: RouteRequestEmail;
  suggestedCustomerName: string | null;
  senderNotVerified: boolean;
}

type Result = { ok: true } | { ok: false; error: string };

type Verdicts = { spfVerdict?: string | null; dkimVerdict?: string | null; dmarcVerdict?: string | null };

/** Flagged "Sender not verified": SES reports SPF, DKIM or DMARC as failed. It's a flag, never a rejection (ADR 0008). */
export function isSenderNotVerified(verdicts: Verdicts): boolean {
  return [verdicts.spfVerdict, verdicts.dkimVerdict, verdicts.dmarcVerdict].some((verdict) => verdict === 'FAIL');
}

/** Every Route Request, whatever its status, most recently received first. A failed page is an error, not a shorter inbox. */
export async function listRouteRequests(): Promise<{ data: RouteRequestRow[]; error?: string }> {
  try {
    const client = getDataClient();
    const [requests, customers] = await Promise.all([
      listAll(client, 'RouteRequestEmail'),
      listAll(client, 'Customer', { selectionSet: ['id', 'name', 'companyName'] }),
    ]);
    const errors = [...requests.errors, ...customers.errors];
    if (errors.length > 0) {
      console.error('Errors loading Route Requests:', errors);
      return { data: [], error: 'Could not load every Route Request, so the inbox may be incomplete.' };
    }

    const names = new Map(customers.data.map((customer) => [customer.id, customer.companyName || customer.name]));
    return {
      data: requests.data
        .map((request) => ({
          request,
          suggestedCustomerName: request.suggestedCustomerId ? (names.get(request.suggestedCustomerId) ?? null) : null,
          senderNotVerified: isSenderNotVerified(request),
        }))
        // By when SES received it: the Date header is whatever the sender's client said.
        .sort((a, b) => b.request.receivedAt.localeCompare(a.request.receivedAt)),
    };
  } catch (error) {
    console.error('Error loading Route Requests:', error);
    return { data: [], error: 'Could not load Route Requests.' };
  }
}

/** Dismisses a Route Request: hidden from the inbox by default, never deleted. A reason is required. */
export async function dismissRouteRequest(id: string, reason: string): Promise<Result> {
  const dismissedReason = reason.trim();
  if (!dismissedReason) return { ok: false, error: 'Give a reason for dismissing it.' };
  try {
    const dismissedBySub = await fetchUserId();
    const { errors } = await getDataClient().models.RouteRequestEmail.update({
      id,
      status: 'dismissed',
      dismissedReason,
      dismissedAt: new Date().toISOString(),
      dismissedBySub,
    });
    if (errors?.length) throw new Error(JSON.stringify(errors));
    return { ok: true };
  } catch (error) {
    console.error('Dismissing the Route Request failed:', error);
    return { ok: false, error: 'Could not dismiss the Route Request.' };
  }
}

/** A few-minute download link to an attachment (by position) or, with 'raw', the message as received. */
export async function openRouteRequestFile(requestId: string, file: number | 'raw'): Promise<string> {
  return (await callApi<{ url: string }>('/api/route-requests/file', { requestId, file })).url;
}
