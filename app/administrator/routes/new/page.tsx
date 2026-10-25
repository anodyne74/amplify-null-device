'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { RouteForm, type RouteDraftStop } from '@/app/operator/components/RouteForm';
import { RequesterFields, RouteRequestView, localNow, recordTitle } from '@/app/administrator/components/RouteRequests';
import { pickStopLocationFields } from '@/lib/locationPrecision';
import { nextRouteCode, type RouteCodeEntry } from '@/lib/routeCode';
import { routeCodeFeedback } from '@/app/administrator/components/routeCodeFeedback';
import { checkRouteDateBlocked } from '@/lib/routeScheduleGuard';
import type { StandingPickupDay } from '@/amplify/types';
import { locateDraftStops } from '@/lib/stopLocation';
import { displayNotes } from '@/lib/stopProgress';
import { scheduleDiff } from '@/lib/scheduleDiff';
import { ScheduleDiffPanel, lineKey, type DiffDecision, type DiffLine } from './ScheduleDiffPanel';
import { addToNote, instructionLines, removeFromNote } from '@/lib/scheduleInstructions';
import { appendRouteInstruction } from '@/lib/routeInstructions';
import { agentVocabulary, fieldChanges, matchAgent, withPreviewNote } from '@/lib/scheduleChanges';
import { addToDraft, dropFromDraft, removeAddFromDraft, restoreToDraft, type DraftMarks } from '@/lib/scheduleDiffDraft';
import { ScheduleReadingPanel } from './ScheduleReadingPanel';
import styles from './page.module.css';
import { listAllRoutes, getRouteWithStops } from '@/lib/routes';
import { createRouteWithStops } from '@/lib/createRouteWithStops';
import { activeStops } from '@/lib/loadChange';
import { listAllCustomers } from '@/lib/customers';
import {
  getRouteRequest,
  requesterLabel,
  scheduleAttachmentIndex,
  type RouteRequestRecord,
  type ScheduleReading,
} from '@/lib/routeRequests';

// A draft Stop, with where the Schedule Diff took it from (lib/scheduleDiffDraft.ts).
type DraftStop = RouteDraftStop & DraftMarks;

function sanitizeCopiedStopNotes(notes?: string | null) {
  if (!notes) return undefined;

  // Stop Progress markers (lib/stopProgress.ts), and an older bare tag from before them.
  const cleaned = displayNotes(notes)
    .replace(/\[SKIPPED\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export default function NewRoutePage() {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading..." />}>
      <NewRoutePageContent />
    </Suspense>
  );
}

function NewRoutePageContent() {
  const router = useRouter();
  const fromRecordId = useSearchParams().get('request');
  const [customers, setCustomers] = useState<Array<{
    id: string;
    name: string;
    email: string;
    addressLine1?: string | null;
    standingInstructions?: string | null;
    defaultNumberOfSigns?: number | null;
    defaultAgentInitials?: string | null;
    agentOptions?: string[] | null;
    standingPickupDay?: StandingPickupDay | null;
  }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Routes' codes already in use: undefined until read, null if they couldn't be.
  const [existingRouteCodes, setExistingRouteCodes] = useState<RouteCodeEntry[] | null | undefined>(undefined);
  const [copyStopSources, setCopyStopSources] = useState<Array<{
    id: string;
    customerId: string;
    label: string;
    createdAt?: string | null;
  }>>([]);

  // The form's draft Stops, and who they are for; the Schedule Diff edits them (ADR 0014).
  const [formStops, setFormStops] = useState<DraftStop[]>([]);
  const formStopsRef = useRef<DraftStop[]>([]);
  const [formCustomerId, setFormCustomerId] = useState('');
  // The Stops as copied, which the Schedule Diff compares with; the draft changes as its lines are accepted.
  const [copiedStops, setCopiedStops] = useState<RouteDraftStop[] | null>(null);
  const [diffDecisions, setDiffDecisions] = useState<Record<string, DiffDecision>>({});
  const [diffBusy, setDiffBusy] = useState<ReadonlySet<string>>(new Set());
  const diffDecisionsRef = useRef<Record<string, DiffDecision>>({});
  // Copied Stops taken out by an accepted Drop, as the administrator last had them, for taking it back.
  const droppedStopsRef = useRef(new Map<number, DraftStop>());
  // Bumped whenever the copy is replaced, so an Add still being found on the map is dropped.
  const diffRunRef = useRef(0);
  // Route-wide instructions accepted, by their position in the reading, and where each Stop instruction went, for taking it back.
  const [acceptedRouteInstructions, setAcceptedRouteInstructions] = useState<Record<number, string>>({});
  const instructionStopsRef = useRef(new Map<number, { copiedFrom?: number; fromRow?: number }>());
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [diffError, setDiffError] = useState<string | null>(null);

  // The Route Request (#359): the inbox record this Route is created from, or
  // one recorded by hand from the uploaded Schedule and an optional requester.
  const [fromRecord, setFromRecord] = useState<RouteRequestRecord | null>(null);
  const [fromRecordError, setFromRecordError] = useState<string | null>(null);
  // What the Schedule says, as shown by the Schedule reading panel; compared with the copied Stops (ADR 0014).
  const [scheduleReading, setScheduleReading] = useState<ScheduleReading | null>(null);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requestedAt, setRequestedAt] = useState(localNow);
  const [requestNote, setRequestNote] = useState('');
  const needsRequester = Boolean(fromRecord?.loggedByStaff);

  useEffect(() => {
    let cancelled = false;
    void listAllRoutes().then(
      (routes) => {
        if (!cancelled) setExistingRouteCodes(routes as RouteCodeEntry[]);
      },
      () => {
        if (!cancelled) setExistingRouteCodes(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The code follows the Placement Date (lib/routeCode.ts), and nothing is suggested until the codes in use are known.
  const suggestRouteCode = useCallback(
    (placementDate: string) => (existingRouteCodes === undefined ? '' : (nextRouteCode((existingRouteCodes ?? []).map((route) => route.routeCode), placementDate) ?? '')),
    [existingRouteCodes]
  );

  // Creating from a Route Request: the Customer's latest Route is the one to copy, unless another is chosen.
  const latestFormCopySourceId = fromRecord
    ? (copyStopSources
        .filter((route) => route.customerId === formCustomerId)
        .sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0))[0]?.id ?? '')
    : '';

  useEffect(() => {
    if (!fromRecordId) return;
    let cancelled = false;
    void getRouteRequest(fromRecordId).then((record) => {
      if (cancelled) return;
      if (!record || record.status !== 'unlinked') {
        setFromRecordError('That email is no longer in the Request inbox, so this Route won\u2019t be linked to it.');
        return;
      }
      setFromRecord(record);
    });
    return () => {
      cancelled = true;
    };
  }, [fromRecordId]);

  useEffect(() => {
    async function fetchCustomers() {
      setLoadingCustomers(true);
      const result = await listAllCustomers().catch(() => null);
      if (result) {
        setCustomers(
          (result as any[]).map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            addressLine1: c.addressLine1 ?? null,
            standingInstructions: c.standingInstructions ?? null,
            defaultNumberOfSigns: c.defaultNumberOfSigns ?? null,
            defaultAgentInitials: c.defaultAgentInitials ?? null,
            agentOptions: c.agentOptions ?? null,
            standingPickupDay: c.standingPickupDay ?? null,
          }))
        );
      }
      setLoadingCustomers(false);
    }
    fetchCustomers();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchRoutesForCopy() {
      const routes = await listAllRoutes().catch(() => null);
      if (cancelled || !routes) return;

      const mapped = (routes as Array<{
        id: string;
        customerId: string;
        routeCode?: string | null;
        createdAt?: string | null;
      }>).map((route) => {
        const dateLabel = route.createdAt
          ? new Date(route.createdAt).toLocaleDateString()
          : null;
        const baseLabel = route.routeCode?.trim() || route.id;
        return {
          id: route.id,
          customerId: route.customerId,
          label: dateLabel ? `${baseLabel} (${dateLabel})` : baseLabel,
          createdAt: route.createdAt ?? null,
        };
      });

      setCopyStopSources(mapped);
    }

    void fetchRoutesForCopy();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (values: {
    routeCode: string;
    customerId: string;
    scheduledDate: string;
    pickupDate: string;
    notes: string;
    stops: RouteDraftStop[];
  }) => {
    const requestProblem = routeRequestProblem();
    if (requestProblem) { setSubmitError(requestProblem); return; }
    setIsSubmitting(true);
    setSubmitError(null);
    const result = await createRouteWithStops({
      route: { ...values, customerInstructions: customerInstructionsToCreate() },
      stops: values.stops,
      request: routeRequestFor(),
    });
    if (!result.ok) {
      setSubmitError(result.error);
      setIsSubmitting(false);
      return;
    }
    router.push(`/administrator/routes/detail?id=${result.routeId}`);
  };

  const handleCancel = () => {
    router.push('/administrator/routes');
  };

  const handleCopyStopsFromRoute = async (sourceRouteId: string): Promise<RouteDraftStop[]> => {
    const stops = (await getRouteWithStops(sourceRouteId).catch(() => {
      throw new Error('Failed to load source route stops.');
    }))?.stops ?? [];

    // A Stop a Load Change removed isn't copied.
    return activeStops(stops).map((stop) => {
      const normalizedLatitude = normalizeOptionalNumber(stop.latitude);
      const normalizedLongitude = normalizeOptionalNumber(stop.longitude);
      const normalizedSigns = normalizeOptionalNumber(stop.numberOfSigns);
      return {
        // The source Stop's precision and address components travel with its pin.
        ...pickStopLocationFields(stop),
        address: stop.address?.trim() || stop.formattedAddress?.trim() || 'Unknown address',
        numberOfSigns: normalizedSigns,
        agent: stop.agent ?? undefined,
        isAuction: stop.isAuction ?? undefined,
        notes: sanitizeCopiedStopNotes(stop.notes),
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
        formattedAddress: stop.formattedAddress ?? undefined,
      };
    });
  };

  // Copying into the form starts the Schedule Diff over against the Stops just copied (ADR 0014).
  const copyStopsIntoForm = async (sourceRouteId: string): Promise<RouteDraftStop[]> => {
    const copied = await handleCopyStopsFromRoute(sourceRouteId);
    if (copied.length > 0) {
      resetDiffDecisions();
      setCopiedStops(copied);
      setParseWarnings([]);
      setDiffError(null);
    }
    return copied.map((stop, i) => ({ ...stop, copiedFrom: i }));
  };

  const handleFormCustomerChange = (customerId: string) => {
    setFormCustomerId(customerId);
    // Stops copied for one Customer, and the lines decided against them, are not another's.
    if (copiedStops) {
      resetDiffDecisions();
      setCopiedStops(null);
      setFormStops([]);
      setParseWarnings([]);
      setDiffError(null);
    }
  };

  const routeRequestProblem = () => {
    if (needsRequester && !requesterName.trim()) return 'Enter the name of the person who asked for this Route, in the panel above.';
    if (!fromRecord && !requestedAt) return 'Enter when the Route was requested, under Route Request.';
    return null;
  };

  // Links the email, or records the upload, as the new Route's Route Request.
  const routeRequestFor = () => {
    const name = requesterName.trim();
    return {
      fromRecordId: fromRecord?.id ?? null,
      requester: name ? { name, email: requesterEmail } : null,
      requestedAt: new Date(requestedAt).toISOString(),
      note: fromRecord ? null : requestNote,
      file: null,
    };
  };

  function resetDiffDecisions() {
    diffRunRef.current += 1;
    diffDecisionsRef.current = {};
    setDiffDecisions({});
    setDiffBusy(new Set());
    droppedStopsRef.current.clear();
    instructionStopsRef.current.clear();
    setAcceptedRouteInstructions({});
  }

  const setDiffDecision = (key: string, decision: DiffDecision) => {
    diffDecisionsRef.current = { ...diffDecisionsRef.current, [key]: decision };
    setDiffDecisions(diffDecisionsRef.current);
  };

  const setLineBusy = (key: string, busy: boolean) =>
    setDiffBusy((current) => {
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });

  // The change a Change line stands for, worked out again from the reading and the copy it was shown against.
  const changeFor = (line: DiffLine & { kind: 'change' }) => {
    const original = copiedStops?.[line.index];
    const rows = (scheduleReading?.rows ?? []).filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (!original) return undefined;
    const match = scheduleDiff(rows, copiedStops ?? []).matched.find(({ stop }) => stop === original);
    return match ? fieldChanges(match.row, original, agentVocabulary(copiedStops ?? [])).find((change) => change.field === line.field) : undefined;
  };

  // Accepts or rejects Schedule Diff lines (ADR 0014): accepting puts an Add in the draft, found on the map first, or takes a Drop out;
  // rejecting a line that was accepted takes it back. Rejecting any other leaves the copy as it was.
  const decideDiffLines = async (lines: DiffLine[], decision: DiffDecision) => {
    const run = diffRunRef.current;
    for (const line of lines) {
      const key = lineKey(line);
      const previous = diffDecisionsRef.current[key];
      if (previous === decision) continue;

      if (line.kind === 'instruction') {
        const instruction = scheduleReading?.instructions?.[line.index];
        if (!instruction) continue;
        const text = instruction.text;
        if (decision === 'accepted') {
          if (!instruction.address) {
            setAcceptedRouteInstructions((current) => ({ ...current, [line.index]: text }));
          } else {
            // Placed against the draft as it is now, so an Add accepted a moment ago counts.
            const placed = instructionLines([{ text, address: instruction.address }], formStopsRef.current ?? [], null)[0];
            if (placed.target.kind !== 'stop') continue;
            const target = formStopsRef.current![placed.target.draftIndex];
            instructionStopsRef.current.set(line.index, { copiedFrom: target.copiedFrom, fromRow: target.fromRow });
            setFormStops((draft) =>
              draft ? draft.map((stop) => (stop === target ? { ...stop, notes: addToNote(stop.notes, text) } : stop)) : draft
            );
          }
        } else if (previous === 'accepted') {
          if (!instruction.address) {
            setAcceptedRouteInstructions(({ [line.index]: _taken, ...rest }) => rest);
          } else {
            const where = instructionStopsRef.current.get(line.index);
            setFormStops((draft) =>
              draft
                ? draft.map((stop) =>
                    where && stop.copiedFrom === where.copiedFrom && stop.fromRow === where.fromRow
                      ? { ...stop, notes: removeFromNote(stop.notes, text) }
                      : stop
                  )
                : draft
            );
          }
        }
      } else if (line.kind === 'change') {
        // Only the one field of the one Stop; undoing it puts back what the copy had.
        const original = copiedStops?.[line.index];
        const row = changeFor(line);
        if (!original || !row) continue;
        const value = decision === 'accepted' ? row.to : previous === 'accepted' ? row.from : undefined;
        if (decision === 'accepted' || previous === 'accepted') {
          setFormStops((draft) =>
            draft
              ? draft.map((stop) => {
                  if (stop.copiedFrom !== line.index) return stop;
                  // A Preview is added to the note as it stands now, which may have been edited since the copy.
                  if (line.field === 'notes' && decision === 'accepted') return { ...stop, notes: withPreviewNote(stop.notes) ?? stop.notes };
                  return { ...stop, [line.field]: value };
                })
              : draft
          );
        }
      } else if (decision === 'accepted' && line.kind === 'drop') {
        setFormStops((draft) => {
          if (!draft) return draft;
          const result = dropFromDraft(draft, line.index);
          if (result.dropped) droppedStopsRef.current.set(line.index, result.dropped);
          return result.draft;
        });
      } else if (decision === 'accepted') {
        const row = scheduleReading?.rows?.[line.index];
        if (!row) continue;
        setLineBusy(key, true);
        try {
          const located = await locateDraftStops<RouteDraftStop>([
            {
              address: row.address,
              numberOfSigns: row.numberOfSigns ?? undefined,
              // In the spelling the Route already uses for that agent.
              agent: row.agent ? matchAgent(row.agent, agentVocabulary(copiedStops ?? [])).agent : undefined,
              isAuction: row.isAuction ?? undefined,
              notes: row.isPreview ? withPreviewNote(null) : undefined,
            },
          ]);
          if (diffRunRef.current !== run) return;
          const [stop] = located.stops;
          if (!stop) {
            setDiffError(`${row.address} has no suburb that could be found on the map, so it was not added. Add it to the Route once it's created, with the suburb.`);
            continue;
          }
          if (located.unpinned > 0) {
            setParseWarnings((warnings) => [...warnings, `${row.address} couldn't be found on the map and will be created without a pin. It still appears in Property History.`]);
          }
          setFormStops((draft) => (draft ? addToDraft(draft, { ...stop, fromRow: line.index }) : draft));
        } finally {
          setLineBusy(key, false);
        }
      } else if (previous === 'accepted' && line.kind === 'drop') {
        const original = copiedStops?.[line.index];
        const stop = droppedStopsRef.current.get(line.index) ?? (original && { ...original, copiedFrom: line.index });
        if (stop) setFormStops((draft) => (draft ? restoreToDraft(draft, stop) : draft));
      } else if (previous === 'accepted') {
        setFormStops((draft) => (draft ? removeAddFromDraft(draft, line.index) : draft));
      }
      setDiffDecision(key, decision);
    }
  };

  const lastReadAtRef = useRef<string | null>(null);
  useEffect(() => {
    const readAt = scheduleReading?.readAt ?? null;
    const changed = lastReadAtRef.current !== null && readAt !== lastReadAtRef.current;
    lastReadAtRef.current = readAt;
    if (changed && copiedStops && Object.keys(diffDecisionsRef.current).length > 0) {
      resetDiffDecisions();
      setFormStops(copiedStops.map((stop, i) => ({ ...stop, copiedFrom: i })));
    }
  }, [scheduleReading, copiedStops]);

  useEffect(() => {
    formStopsRef.current = formStops;
  }, [formStops]);

  // The accepted route-wide instructions as the Route's customer instructions (lib/routeInstructions.ts), in the reading's order.
  const customerInstructionsToCreate = () =>
    Object.entries(acceptedRouteInstructions)
      .sort(([a], [b]) => Number(a) - Number(b))
      .reduce<string | undefined>((feed, [, text]) => appendRouteInstruction(feed, { text }), undefined);

  const routeForm = (
    <RouteForm
      customers={customers}
      suggestRouteCode={suggestRouteCode}
      routeCodeFeedback={(code) => routeCodeFeedback(existingRouteCodes, code)}
      stops={formStops}
      onStopsChange={(stops) => setFormStops(stops as DraftStop[])}
      suggestedCustomerId={fromRecord?.suggestedCustomerId ?? undefined}
      suggestedCopySourceId={latestFormCopySourceId || undefined}
      onCustomerChange={handleFormCustomerChange}
      underCopyStops={
        <>
          {parseWarnings.length > 0 && (
            <div className={styles.warningsBanner}>
              {parseWarnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}
          {diffError && <div className={styles.errorBanner}>{diffError}</div>}
          {copiedStops && scheduleReading && (
            <ScheduleDiffPanel
              reading={scheduleReading}
              stops={copiedStops}
              decisions={diffDecisions}
              draftStops={formStops}
              standingInstructions={customers.find((customer) => customer.id === formCustomerId)?.standingInstructions}
              busy={diffBusy}
              onDecide={(lines, decision) => void decideDiffLines(lines, decision)}
            />
          )}
          {copiedStops && fromRecord && !scheduleReading && scheduleAttachmentIndex(fromRecord.attachments) !== null && (
            <p className={styles.importHint}>Read the Schedule, above, to see what changed since this Route.</p>
          )}
        </>
      }
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      isSubmitting={isSubmitting}
      error={submitError}
      copyStopSources={copyStopSources}
      onCopyStopsFromSource={copyStopsIntoForm}
      onCheckDateBlock={checkRouteDateBlocked}
    />
  );

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.container}>
        <Breadcrumbs
          items={[
            { label: 'Routes', href: '/administrator/routes' },
            { label: 'New Route' },
          ]}
        />
        <PageHeader title="Create New Route" />

        {loadingCustomers ? (
          <LoadingSpinner message="Loading customers..." />
        ) : (
          <>
            {fromRecord && (
              <Card title="Creating from email">
                <details className={styles.fromRecord} open>
                  <summary>
                    Creating from <strong>{recordTitle(fromRecord)}</strong> from {requesterLabel(fromRecord)}. It becomes this
                    Route&rsquo;s Route Request.
                  </summary>
                  <RouteRequestView record={fromRecord} />
                </details>
                <ScheduleReadingPanel record={fromRecord} onReading={setScheduleReading} />
                {needsRequester && (
                  <div className={styles.fieldsStack}>
                    <RequesterFields
                      idPrefix="request"
                      name={requesterName}
                      email={requesterEmail}
                      required
                      onName={setRequesterName}
                      onEmail={setRequesterEmail}
                    />
                  </div>
                )}
              </Card>
            )}

            {!fromRecord && (
              <Card title="Route Request">
                {fromRecordError && <div className={styles.warningsBanner}>{fromRecordError}</div>}
                <p className={styles.importHint}>
                  Who asked for this Route. Leave it blank and the Route has no Route Request.
                </p>
                <div className={styles.fieldsStack}>
                  <RequesterFields
                    idPrefix="request"
                    name={requesterName}
                    email={requesterEmail}
                    required={false}
                    onName={setRequesterName}
                    onEmail={setRequesterEmail}
                  />
                  <Field label="Requested at" htmlFor="request-requested-at">
                    <Input
                      id="request-requested-at"
                      type="datetime-local"
                      value={requestedAt}
                      onChange={(e) => setRequestedAt(e.target.value)}
                    />
                  </Field>
                  <Field label="Note (optional)" htmlFor="request-note" hint="e.g. what was asked for on the phone">
                    <Input id="request-note" value={requestNote} onChange={(e) => setRequestNote(e.target.value)} />
                  </Field>
                </div>
              </Card>
            )}

            {routeForm}
          </>
        )}
      </div>
    </OperatorRoute>
  );
}
