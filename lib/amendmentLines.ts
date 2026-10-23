/**
 * Deciding the lines of a Route Amendment's Schedule Diff (ADR 0014). Accepting
 * an add creates the Stop on the Route, at the end of its order; accepting a
 * drop deletes the Stop (before Load there is no Removed Stop), and the rest are
 * renumbered. Rejecting leaves the Route as it was; either way the decision is kept on the record, so
 * it survives a reload. Lines can be accepted only until Load starts: after that
 * the change is a Load Change (CONTEXT.md). Rejecting is always allowed.
 */
import { fetchUserId } from '@/lib/amplify-config';
import { recordAudit } from '@/lib/auditLog';
import { getDataClient } from '@/lib/data-client';
import { getCustomer } from '@/lib/customers';
import { createStop, deleteStop, resequenceStops } from '@/lib/routes';
import { pickStopLocationFields } from '@/lib/locationPrecision';
import { locateDraftStops } from '@/lib/stopLocation';
import { agentVocabulary, matchAgent } from '@/lib/scheduleChanges';
import { isRouteCompleted } from '@/lib/signRunPhase';

export type AmendmentDecisionValue = 'accepted' | 'rejected';

export type StoredDecision = {
  change: string;
  address: string;
  decision: string;
  decidedAt: string;
  decidedBySub: string;
  stopId?: string | null;
};

export type AmendmentLineRoute = { id: string; customerId?: string | null; loadStartedAt?: string | null; status?: string | null };

export type AmendmentAddRow = {
  address?: string;
  change?: string | null;
  numberOfSigns?: number | null;
  agent?: string | null;
  isAuction?: boolean | null;
  isPreview?: boolean | null;
};

export type LineResult = { ok: true; warning?: string } | { ok: false; error: string };

export const LOAD_STARTED_MESSAGE = 'Load has started on this Route, so this change has to be made as a Load Change.';

/** Whether Amendment lines can still be accepted: not once Load has started. */
export function canAcceptLines(route: Pick<AmendmentLineRoute, 'loadStartedAt' | 'status'>): boolean {
  return !route.loadStartedAt && !isRouteCompleted(route.status);
}

/** The line's identity within a record: the same address read again is the same line. */
export const decisionKey = (change: string, address: string) => `${change}:${address.trim().toLowerCase()}`;

export function decisionFor(decisions: ReadonlyArray<StoredDecision | null | undefined> | null | undefined, change: string, address: string): StoredDecision | undefined {
  return (decisions ?? []).find((item): item is StoredDecision => item != null && decisionKey(item.change, item.address) === decisionKey(change, address));
}

/** The decisions with this one in place of any earlier one on the same line. */
export function withDecision(decisions: ReadonlyArray<StoredDecision | null | undefined> | null | undefined, next: StoredDecision): StoredDecision[] {
  const others = (decisions ?? []).filter((item): item is StoredDecision => item != null && decisionKey(item.change, item.address) !== decisionKey(next.change, next.address));
  return [...others, next];
}

async function saveDecisions(recordId: string, decisions: StoredDecision[]): Promise<boolean> {
  const { errors } = await getDataClient().models.RouteRequestRecord.update({ id: recordId, amendmentDecisions: decisions });
  if (errors?.length) {
    console.error('Saving the Amendment decision failed:', errors);
    return false;
  }
  return true;
}

async function audit(route: AmendmentLineRoute, resourceId: string, action: string, details: unknown, actor: string) {
  const result = await recordAudit(getDataClient(), {
    actor,
    customerId: route.customerId,
    eventType: 'data_modification',
    resource: { type: 'stop', id: resourceId },
    action,
    details,
  });
  if (!result.ok) console.error(`Writing the ${action} audit entry failed:`, result.errors);
  return result.ok;
}

/** Rejects a line: nothing about the Route changes. */
export async function rejectAmendmentLine(input: {
  recordId: string;
  decisions: ReadonlyArray<StoredDecision | null | undefined> | null | undefined;
  change: 'add' | 'drop';
  address: string;
}): Promise<LineResult> {
  const bySub = (await fetchUserId()) ?? 'unknown';
  const next: StoredDecision = { change: input.change, address: input.address, decision: 'rejected', decidedAt: new Date().toISOString(), decidedBySub: bySub };
  return (await saveDecisions(input.recordId, withDecision(input.decisions, next))) ? { ok: true } : { ok: false, error: 'Could not save the decision.' };
}

/**
 * Accepts an add: the property becomes a Stop at the end of the Route's order,
 * with the agent in the spelling the Route already uses, and a pin when the map
 * finds one. `address` is the line as the Diff completed it (with a suburb).
 */
export async function acceptAmendmentAdd(input: {
  recordId: string;
  decisions: ReadonlyArray<StoredDecision | null | undefined> | null | undefined;
  route: AmendmentLineRoute;
  stops: ReadonlyArray<{ sequence?: number | null; agent?: string | null }>;
  row: AmendmentAddRow;
  address: string;
}): Promise<LineResult> {
  const { route, row, address } = input;
  if (!canAcceptLines(route)) return { ok: false, error: LOAD_STARTED_MESSAGE };
  if (!route.customerId) return { ok: false, error: 'This Route has no Customer, so a Stop cannot be added to it.' };

  let warning: string | undefined;
  const located = await locateDraftStops([{ address }]);
  const [located0] = located.stops;
  if (!located0) return { ok: false, error: `${address} has no suburb that could be found on the map, so it was not added. Add it to the Route by hand, with the suburb.` };
  if (located.unpinned > 0) warning = `${address} couldn't be found on the map, so it was added without a pin. It still appears in Property History.`;

  const customer = await getCustomer(route.customerId).catch(() => null);
  const agentChoices = agentVocabulary(input.stops.map((stop) => ({ agent: stop.agent })) as Parameters<typeof agentVocabulary>[0]);
  const numberOfSigns = row.numberOfSigns ?? customer?.defaultNumberOfSigns ?? undefined;

  let stopId: string | undefined;
  try {
    const created = await createStop({
      ...pickStopLocationFields(located0),
      routeId: route.id,
      customerId: route.customerId,
      sequence: Math.max(0, ...input.stops.map((stop) => stop.sequence ?? 0)) + 1,
      address,
      ...(numberOfSigns !== undefined && { numberOfSigns }),
      ...(row.agent && { agent: matchAgent(row.agent, agentChoices).agent }),
      ...(row.isAuction && { isAuction: true }),
    });
    stopId = (created as { id?: string } | null | undefined)?.id;
  } catch (error) {
    console.error('Adding the Amendment Stop failed:', error);
    return { ok: false, error: `Could not add ${address} to the Route.` };
  }

  const bySub = (await fetchUserId()) ?? 'unknown';
  const next: StoredDecision = { change: 'add', address: input.address, decision: 'accepted', decidedAt: new Date().toISOString(), decidedBySub: bySub, ...(stopId && { stopId }) };
  const saved = await saveDecisions(input.recordId, withDecision(input.decisions, next));
  const audited = await audit(route, stopId ?? route.id, 'amendment_add_accepted', { recordId: input.recordId, address }, bySub);
  if (!saved || !audited) {
    return { ok: true, warning: `${address} was added to the Route, but ${!saved ? 'the decision' : 'the audit entry'} could not be saved.` };
  }
  return { ok: true, ...(warning && { warning }) };
}

/**
 * Accepts a drop: the Stop is deleted from the Route and the Stops left are
 * renumbered. The audit entry names the Stop deleted, since nothing else will.
 */
export async function acceptAmendmentDrop(input: {
  recordId: string;
  decisions: ReadonlyArray<StoredDecision | null | undefined> | null | undefined;
  route: AmendmentLineRoute;
  stops: ReadonlyArray<{ id: string; sequence?: number | null }>;
  stop: { id: string; address: string };
  /** The row's address as read, which identifies the line. */
  address: string;
}): Promise<LineResult> {
  const { route, stop } = input;
  if (!canAcceptLines(route)) return { ok: false, error: LOAD_STARTED_MESSAGE };

  try {
    await deleteStop(stop.id);
  } catch (error) {
    console.error('Deleting the Amendment Stop failed:', error);
    return { ok: false, error: `Could not take ${stop.address} off the Route.` };
  }

  // The Stop is gone; failing to renumber leaves a gap in the order, not a wrong Route.
  const remaining = input.stops
    .filter((item) => item.id !== stop.id)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((item) => item.id);
  let warning: string | undefined;
  try {
    await resequenceStops(remaining);
  } catch (error) {
    console.error('Renumbering the Stops after an Amendment drop failed:', error);
    warning = `${stop.address} was taken off the Route, but the order of the other Stops could not be saved.`;
  }

  const bySub = (await fetchUserId()) ?? 'unknown';
  const next: StoredDecision = { change: 'drop', address: input.address, decision: 'accepted', decidedAt: new Date().toISOString(), decidedBySub: bySub, stopId: stop.id };
  const saved = await saveDecisions(input.recordId, withDecision(input.decisions, next));
  const audited = await audit(route, stop.id, 'amendment_drop_accepted', { recordId: input.recordId, address: stop.address }, bySub);
  if (!saved || !audited) {
    return { ok: true, warning: `${stop.address} was taken off the Route, but ${!saved ? 'the decision' : 'the audit entry'} could not be saved.` };
  }
  return { ok: true, ...(warning && { warning }) };
}
