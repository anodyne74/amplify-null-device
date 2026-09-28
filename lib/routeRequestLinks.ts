/**
 * Linking Route Request records to Routes (#359, ADR 0008): as a Route's one
 * Route Request or as one of its Route Amendments, unlinking them again, and
 * recording one by hand. A Route has at most one Route Request. Its
 * RouteRequestSlot enforces that: creating the slot fails if the Route already
 * holds one, so of two administrators linking at once only one succeeds.
 *
 * Takes the data client, so it runs against the browser client and can be
 * tested with a fake one. Kept free of `@/` imports like its neighbours.
 */
import { listAllPages } from './listAll';

export type RouteRequestRole = 'request' | 'amendment';

export type LinkResult = { ok: true } | { ok: false; error: string };

type StoredAttachment = { key: string; filename: string; contentType?: string | null; size?: number | null; inline?: boolean | null };

type ModelResponse = { data?: unknown; errors?: readonly unknown[] | null };
type Listed = { data: unknown[]; errors?: readonly unknown[] | null; nextToken?: string | null };

/** The model calls these rules make; the browser data client fits it. */
export type LinkClient = {
  models: {
    RouteRequestRecord: {
      get: (input: { id: string }) => Promise<ModelResponse>;
      create: (input: object) => Promise<ModelResponse>;
      update: (input: object) => Promise<ModelResponse>;
      listRouteRequestRecordsByRoute: (input: { routeId: string }, options: { limit: number; nextToken?: string }) => Promise<Listed>;
    };
    RouteRequestSlot: {
      get: (input: { id: string }) => Promise<ModelResponse>;
      create: (input: { id: string; recordId: string }) => Promise<ModelResponse>;
      delete: (input: { id: string }) => Promise<ModelResponse>;
    };
  };
};

type RecordRow = { id: string; status?: string | null; routeId?: string | null; role?: string | null; loggedByStaff?: boolean | null };

const ALREADY_HAS_REQUEST = 'That Route already has a Route Request.';

const UNLINKED = { status: 'unlinked', routeId: null, role: null, linkedAt: null, linkedBySub: null } as const;

function trimmedOrNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** Takes the Route's slot for this record. A slot already held for another record means the Route has its Route Request. */
async function claimSlot(client: LinkClient, routeId: string, recordId: string): Promise<LinkResult> {
  const { errors } = await client.models.RouteRequestSlot.create({ id: routeId, recordId });
  if (!errors?.length) return { ok: true };
  // Left over from an earlier attempt for this same record, which didn't finish: still ours.
  const existing = await client.models.RouteRequestSlot.get({ id: routeId });
  const holder = existing.data as { recordId?: string } | null | undefined;
  if (holder?.recordId === recordId) return { ok: true };
  if (holder) return { ok: false, error: ALREADY_HAS_REQUEST };
  console.error('Claiming the Route Request slot failed:', errors);
  return { ok: false, error: 'Could not link it to the Route.' };
}

/** Gives a Route's slot back, if this record holds it. */
async function releaseSlot(client: LinkClient, routeId: string, recordId: string): Promise<unknown[]> {
  const { data, errors } = await client.models.RouteRequestSlot.get({ id: routeId });
  if (errors?.length) return [...errors];
  if ((data as { recordId?: string } | null)?.recordId !== recordId) return [];
  const deleted = await client.models.RouteRequestSlot.delete({ id: routeId });
  return [...(deleted.errors ?? [])];
}

/**
 * Links an Unlinked record to a Route as its Route Request or as an Amendment.
 * An email Logged by staff needs the real requester's name (ADR 0008); it's
 * kept with who entered it, which makes the result manual.
 */
export async function linkRouteRequestRecord(
  client: LinkClient,
  input: {
    recordId: string;
    routeId: string;
    role: RouteRequestRole;
    requester?: { name: string; email?: string | null };
    bySub: string | null;
    now: string;
  }
): Promise<LinkResult> {
  const { recordId, routeId, role } = input;
  const { data, errors } = await client.models.RouteRequestRecord.get({ id: recordId });
  const record = data as RecordRow | null | undefined;
  if (errors?.length || !record) {
    console.error('Reading the Route Request record failed:', errors);
    return { ok: false, error: 'Could not find it.' };
  }
  if (record.status === 'linked') return { ok: false, error: 'It is already linked to a Route. Unlink it first.' };

  const requesterName = trimmedOrNull(input.requester?.name);
  if (record.loggedByStaff && !requesterName) return { ok: false, error: 'Enter the name of the person who asked for it.' };

  if (role === 'request') {
    const claimed = await claimSlot(client, routeId, recordId);
    if (!claimed.ok) return claimed;
  }

  const updated = await client.models.RouteRequestRecord.update({
    id: recordId,
    status: 'linked',
    routeId,
    role,
    linkedAt: input.now,
    linkedBySub: input.bySub,
    unlinkedNote: null,
    ...(requesterName
      ? { requesterName, requesterEmail: trimmedOrNull(input.requester?.email), enteredBySub: input.bySub }
      : {}),
  });
  if (updated.errors?.length) {
    console.error('Linking the Route Request record failed:', updated.errors);
    if (role === 'request') await releaseSlot(client, routeId, recordId);
    return { ok: false, error: 'Could not link it to the Route.' };
  }
  return { ok: true };
}

/**
 * Returns a linked record to the inbox. The record is updated before its
 * Route's slot is given back, so a failure part-way leaves the Route refusing
 * a new Route Request rather than holding two.
 */
export async function unlinkRouteRequestRecord(client: LinkClient, recordId: string, unlinkedNote: string | null = null): Promise<LinkResult> {
  const { data, errors } = await client.models.RouteRequestRecord.get({ id: recordId });
  const record = data as RecordRow | null | undefined;
  if (errors?.length || !record) {
    console.error('Reading the Route Request record failed:', errors);
    return { ok: false, error: 'Could not find it.' };
  }
  return unlinkRecord(client, record, unlinkedNote);
}

async function unlinkRecord(client: LinkClient, record: RecordRow, unlinkedNote: string | null): Promise<LinkResult> {
  const updated = await client.models.RouteRequestRecord.update({ id: record.id, ...UNLINKED, unlinkedNote });
  if (updated.errors?.length) {
    console.error('Unlinking the Route Request record failed:', updated.errors);
    return { ok: false, error: 'Could not unlink it.' };
  }
  if (record.role === 'request' && record.routeId) {
    const slotErrors = await releaseSlot(client, record.routeId, record.id);
    if (slotErrors.length > 0) {
      console.error('Freeing the Route’s Route Request slot failed:', slotErrors);
      return { ok: false, error: 'It was unlinked, but the Route still counts it as its Route Request. Try again.' };
    }
  }
  return { ok: true };
}

/**
 * Records a Route Request or Amendment that didn't come by email -- a phone
 * call, say, or a Schedule uploaded on New route. It's marked manual, with the
 * administrator who entered it; a null requester means an administrator
 * uploaded it. With a routeId it's linked straight away.
 */
export async function recordManualRouteRequest(
  client: LinkClient,
  input: {
    id: string;
    routeId: string | null;
    role: RouteRequestRole;
    requesterName: string | null;
    requesterEmail: string | null;
    sentAt: string;
    note: string | null;
    attachments: StoredAttachment[];
    customerId?: string | null;
    bySub: string | null;
    now: string;
  }
): Promise<LinkResult> {
  const { id, routeId, role } = input;
  if (routeId && role === 'request') {
    const claimed = await claimSlot(client, routeId, id);
    if (!claimed.ok) return claimed;
  }

  const created = await client.models.RouteRequestRecord.create({
    id,
    source: 'manual',
    sentAt: input.sentAt,
    receivedAt: input.now,
    requesterName: trimmedOrNull(input.requesterName),
    requesterEmail: trimmedOrNull(input.requesterEmail),
    note: trimmedOrNull(input.note),
    attachments: input.attachments,
    suggestedCustomerId: input.customerId ?? null,
    enteredBySub: input.bySub,
    ...(routeId
      ? { status: 'linked', routeId, role, linkedAt: input.now, linkedBySub: input.bySub }
      : { status: 'unlinked' }),
  });
  if (created.errors?.length) {
    console.error('Recording the Route Request failed:', created.errors);
    if (routeId && role === 'request') await releaseSlot(client, routeId, id);
    return { ok: false, error: 'Could not record the Route Request.' };
  }
  return { ok: true };
}

/**
 * Returns every record of a Route being deleted to the inbox, with a note
 * naming the Route, so they're kept and can be linked again (ADR 0008).
 * Returns the errors; the caller mustn't delete the Route if there are any.
 */
export async function unlinkRecordsOfDeletedRoute(client: LinkClient, routeId: string, routeCode: string): Promise<unknown[]> {
  const listed = await listAllPages<RecordRow>((page) =>
    client.models.RouteRequestRecord.listRouteRequestRecordsByRoute({ routeId }, page)
  );
  if (listed.errors.length > 0) return listed.errors;

  const errors: unknown[] = [];
  for (const record of listed.data) {
    const result = await unlinkRecord(client, record, `Its Route ${routeCode} was deleted.`);
    if (!result.ok) errors.push(result.error);
  }
  return errors;
}
