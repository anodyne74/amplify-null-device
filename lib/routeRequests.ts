/**
 * Route Requests and Route Amendments (#358, #359, ADR 0008) as administrators
 * read and write them: the inbox of every record, newest first, with its flags,
 * suggested Customer and Route; a Route's own records in the order sent;
 * linking, unlinking, dismissing, and recording one by hand; and links to its
 * files, which only the Route Request file API can hand out.
 */

import type { Schema } from '@/amplify/data/resource';
import { fetchUserId } from '@/lib/amplify-config';
import { callApi } from '@/lib/apiClient';
import { getDataClient } from '@/lib/data-client';
import { listAll, listAllPages } from '@/lib/listAll';
import { requestAttachmentKey } from '@/lib/routeRequestKey';
import {
  linkRouteRequestRecord,
  recordManualRouteRequest,
  unlinkRouteRequestRecord,
  type LinkClient,
  type RouteRequestRole,
} from '@/lib/routeRequestLinks';

export type RouteRequestRecord = Schema['RouteRequestRecord']['type'];
export type { RouteRequestRole };

export interface RouteRequestRow {
  request: RouteRequestRecord;
  suggestedCustomerName: string | null;
  senderNotVerified: boolean;
  /** The code of the Route it's linked to, if any. */
  routeCode: string | null;
}

/** A Route an inbox record can be linked to. */
export interface LinkableRoute {
  id: string;
  label: string;
  customerId: string;
  /** Whether it already has its one Route Request, so can only take Amendments. */
  hasRouteRequest: boolean;
}

type Result = { ok: true } | { ok: false; error: string };

type Verdicts = { spfVerdict?: string | null; dkimVerdict?: string | null; dmarcVerdict?: string | null };

/** Flagged "Sender not verified": SES reports SPF, DKIM or DMARC as failed. It's a flag, never a rejection (ADR 0008). */
export function isSenderNotVerified(verdicts: Verdicts): boolean {
  return [verdicts.spfVerdict, verdicts.dkimVerdict, verdicts.dmarcVerdict].some((verdict) => verdict === 'FAIL');
}

type RequesterFields = Pick<RouteRequestRecord, 'source' | 'loggedByStaff' | 'requesterName' | 'requesterEmail' | 'fromName' | 'fromAddress'>;

/** Recorded by hand, or a Logged-by-staff email whose real requester was entered by hand (ADR 0008). */
export function isManual(record: RequesterFields): boolean {
  return record.source === 'manual' || Boolean(record.loggedByStaff && record.requesterName);
}

function nameAndAddress(name: string | null | undefined, address: string | null | undefined): string {
  if (name && address) return `${name} <${address}>`;
  return name || address || '';
}

/** Who asked: the requester entered by hand if there is one, else the email's sender. */
export function requesterLabel(record: RequesterFields): string {
  if (record.requesterName) return nameAndAddress(record.requesterName, record.requesterEmail);
  if (record.source === 'manual') return 'Uploaded by administrator';
  return nameAndAddress(record.fromName, record.fromAddress);
}

const SCHEDULE_TYPES = /pdf|spreadsheet|excel|csv/i;
const SCHEDULE_EXTENSIONS = /\.(pdf|xlsx?|csv)$/i;

/** The attachment most likely to be the Schedule: the first attached (not inline) PDF, spreadsheet or CSV. */
export function scheduleAttachmentIndex(attachments: RouteRequestRecord['attachments']): number | null {
  const index = (attachments ?? []).findIndex(
    (attachment) =>
      attachment && !attachment.inline && (SCHEDULE_TYPES.test(attachment.contentType ?? '') || SCHEDULE_EXTENSIONS.test(attachment.filename))
  );
  return index >= 0 ? index : null;
}

function linkClient(): LinkClient {
  return getDataClient() as unknown as LinkClient;
}

function routeLabel(route: { routeCode?: string | null; id: string }): string {
  return route.routeCode?.trim() || route.id.slice(0, 8);
}

/** Every record, whatever its status, most recently received first. A failed page is an error, not a shorter inbox. */
export async function listRouteRequests(): Promise<{ data: RouteRequestRow[]; error?: string }> {
  try {
    const client = getDataClient();
    const [requests, customers, routes] = await Promise.all([
      listAll(client, 'RouteRequestRecord'),
      listAll(client, 'Customer', { selectionSet: ['id', 'name', 'companyName'] }),
      listAll(client, 'Route', { selectionSet: ['id', 'routeCode'] }),
    ]);
    const errors = [...requests.errors, ...customers.errors, ...routes.errors];
    if (errors.length > 0) {
      console.error('Errors loading Route Requests:', errors);
      return { data: [], error: 'Could not load every Route Request, so the inbox may be incomplete.' };
    }

    const names = new Map(customers.data.map((customer) => [customer.id, customer.companyName || customer.name]));
    const codes = new Map(routes.data.map((route) => [route.id, routeLabel(route)]));
    return {
      data: requests.data
        .map((request) => ({
          request,
          suggestedCustomerName: request.suggestedCustomerId ? (names.get(request.suggestedCustomerId) ?? null) : null,
          senderNotVerified: isSenderNotVerified(request),
          routeCode: request.routeId ? (codes.get(request.routeId) ?? null) : null,
        }))
        // By when SES received it: the Date header is whatever the sender's client said.
        .sort((a, b) => b.request.receivedAt.localeCompare(a.request.receivedAt)),
    };
  } catch (error) {
    console.error('Error loading Route Requests:', error);
    return { data: [], error: 'Could not load Route Requests.' };
  }
}

/** A Route's Route Request and Amendments, in the order they were sent. */
export async function listRouteRequestsForRoute(routeId: string): Promise<{ data: RouteRequestRecord[]; error?: string }> {
  try {
    const client = getDataClient();
    const { data, errors } = await listAllPages<RouteRequestRecord>((page) =>
      client.models.RouteRequestRecord.listRouteRequestRecordsByRoute({ routeId }, page)
    );
    if (errors.length > 0) {
      console.error("Errors loading the Route's requests:", errors);
      return { data: [], error: "Could not load this Route's requests." };
    }
    return { data: [...data].sort((a, b) => a.sentAt.localeCompare(b.sentAt)) };
  } catch (error) {
    console.error("Error loading the Route's requests:", error);
    return { data: [], error: "Could not load this Route's requests." };
  }
}

/** Every Route, newest first, saying which already have their Route Request. */
export async function listLinkableRoutes(): Promise<{ data: LinkableRoute[]; error?: string }> {
  try {
    const client = getDataClient();
    const [routes, slots] = await Promise.all([
      listAll(client, 'Route', { selectionSet: ['id', 'routeCode', 'customerId', 'scheduledDate', 'createdAt'] }),
      listAll(client, 'RouteRequestSlot', { selectionSet: ['id'] }),
    ]);
    const errors = [...routes.errors, ...slots.errors];
    if (errors.length > 0) {
      console.error('Errors loading Routes to link to:', errors);
      return { data: [], error: 'Could not load the Routes.' };
    }
    const held = new Set(slots.data.map((slot) => slot.id));
    return {
      data: routes.data
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .map((route) => ({
          id: route.id,
          label: route.scheduledDate ? `${routeLabel(route)} (${route.scheduledDate})` : routeLabel(route),
          customerId: route.customerId,
          hasRouteRequest: held.has(route.id),
        })),
    };
  } catch (error) {
    console.error('Error loading Routes to link to:', error);
    return { data: [], error: 'Could not load the Routes.' };
  }
}

/** Links an inbox record to a Route; see linkRouteRequestRecord for the rules. */
export async function linkRouteRequest(input: {
  recordId: string;
  routeId: string;
  role: RouteRequestRole;
  requester?: { name: string; email?: string | null };
}): Promise<Result> {
  try {
    return await linkRouteRequestRecord(linkClient(), { ...input, bySub: (await fetchUserId()) ?? null, now: new Date().toISOString() });
  } catch (error) {
    console.error('Linking the Route Request failed:', error);
    return { ok: false, error: 'Could not link it to the Route.' };
  }
}

/** Returns a record linked by mistake to the inbox. */
export async function unlinkRouteRequest(recordId: string): Promise<Result> {
  try {
    return await unlinkRouteRequestRecord(linkClient(), recordId);
  } catch (error) {
    console.error('Unlinking the Route Request failed:', error);
    return { ok: false, error: 'Could not unlink it.' };
  }
}

/**
 * Records a Route Request or Amendment by hand: stores its files under
 * requests/<new id>/, then the record, linked to the Route if one is given.
 * A null requester means an administrator uploaded it (the New route upload).
 */
export async function recordManualRequest(input: {
  routeId: string | null;
  role: RouteRequestRole;
  requesterName: string | null;
  requesterEmail?: string | null;
  sentAt: string;
  note?: string | null;
  files: File[];
  customerId?: string | null;
}): Promise<Result> {
  try {
    const id = crypto.randomUUID();
    const { uploadData } = await import('aws-amplify/storage');
    const attachments = [];
    for (const [index, file] of input.files.entries()) {
      const key = requestAttachmentKey(id, index, file.name);
      const contentType = file.type || 'application/octet-stream';
      await uploadData({ path: key, data: file, options: { contentType } }).result;
      attachments.push({ key, filename: file.name, contentType, size: file.size, inline: false });
    }
    return await recordManualRouteRequest(linkClient(), {
      id,
      routeId: input.routeId,
      role: input.role,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail ?? null,
      sentAt: input.sentAt,
      note: input.note ?? null,
      attachments,
      customerId: input.customerId,
      bySub: (await fetchUserId()) ?? null,
      now: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Recording the Route Request failed:', error);
    return { ok: false, error: 'Could not record the Route Request.' };
  }
}

/**
 * Gives a Route just created on New route its Route Request: the inbox record
 * it was created from, or else, if a Schedule was uploaded or a requester or
 * note entered, one recorded by hand. With neither, there's nothing to record.
 */
export async function attachNewRouteRequest(input: {
  routeId: string;
  customerId: string;
  fromRecordId: string | null;
  requester: { name: string; email?: string | null } | null;
  requestedAt: string;
  note?: string | null;
  file: File | null;
}): Promise<Result> {
  const { routeId, requester, file } = input;
  if (input.fromRecordId) {
    return linkRouteRequest({ recordId: input.fromRecordId, routeId, role: 'request', requester: requester ?? undefined });
  }
  if (!file && !requester && !input.note?.trim()) return { ok: true };
  return recordManualRequest({
    routeId,
    role: 'request',
    requesterName: requester?.name ?? null,
    requesterEmail: requester?.email ?? null,
    sentAt: input.requestedAt,
    note: input.note,
    files: file ? [file] : [],
    customerId: input.customerId,
  });
}

/** Dismisses a record:hidden from the inbox by default, never deleted. A reason is required. */
export async function dismissRouteRequest(id: string, reason: string): Promise<Result> {
  const dismissedReason = reason.trim();
  if (!dismissedReason) return { ok: false, error: 'Give a reason for dismissing it.' };
  try {
    const dismissedBySub = await fetchUserId();
    const { errors } = await getDataClient().models.RouteRequestRecord.update({
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

/** One of a record's attachments as a File, to load into New route's import panel. */
export async function fetchRouteRequestAttachment(requestId: string, index: number, filename: string, contentType: string | null | undefined): Promise<File> {
  const response = await fetch(await openRouteRequestFile(requestId, index));
  if (!response.ok) throw new Error(`Fetching the attachment failed: ${response.status}`);
  return new File([await response.blob()], filename, { type: contentType ?? '' });
}

/** One record, for New route to prefill from. */
export async function getRouteRequest(id: string): Promise<RouteRequestRecord | null> {
  const { data, errors } = await getDataClient().models.RouteRequestRecord.get({ id });
  if (errors?.length) {
    console.error('Reading the Route Request failed:', errors);
    return null;
  }
  return data;
}
