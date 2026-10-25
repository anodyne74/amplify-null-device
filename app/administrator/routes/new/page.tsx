'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Tabs } from '@/app/components/ui/navigation/Tabs';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import { RouteForm, withDraftStopNote, type RouteDraftStop } from '@/app/operator/components/RouteForm';
import { RequesterFields, RouteRequestView, localNow, recordTitle } from '@/app/administrator/components/RouteRequests';
import { pickStopLocationFields } from '@/lib/locationPrecision';
import { nextRouteCode, type RouteCodeEntry } from '@/lib/routeCode';
import { routeCodeFeedback } from '@/app/administrator/components/routeCodeFeedback';
import { checkRouteDateBlocked } from '@/lib/routeScheduleGuard';
import { pickupDateProblem } from '@/lib/pickupDate';
import { useNewRoutePickupDate } from '@/lib/useNewRoutePickupDate';
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
import { DataError } from '@/lib/graphqlResult';
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

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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
  const [importRouteCode, setImportRouteCode] = useState('');
  const [importRouteCodeTyped, setImportRouteCodeTyped] = useState(false);
  const [copyStopSources, setCopyStopSources] = useState<Array<{
    id: string;
    customerId: string;
    label: string;
    createdAt?: string | null;
  }>>([]);

  // Tab state
  const [activeTab, setActiveTab] = useState<'import' | 'manual'>('import');

  // Import flow state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importCustomerId, setImportCustomerId] = useState('');
  const [importScheduledDate, setImportScheduledDate] = useState(todayDateKey);
  const {
    pickupDate: importPickupDate,
    choosePickupDate: chooseImportPickupDate,
    noOperatorsWarning: importPickupWarning,
  } = useNewRoutePickupDate(
    importScheduledDate,
    importCustomerId,
    customers.find((customer) => customer.id === importCustomerId)?.standingPickupDay,
    checkRouteDateBlocked
  );
  const [importNotes, setImportNotes] = useState('');
  const [formStops, setFormStops] = useState<RouteDraftStop[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDraftStops, setImportDraftStops] = useState<DraftStop[] | null>(null);
  const [importDraftSource, setImportDraftSource] = useState<'copy' | null>(null);
  const [importCopySourceRouteId, setImportCopySourceRouteId] = useState('');
  const [copyingImportStops, setCopyingImportStops] = useState(false);
  // The Stops as copied, which the Schedule Diff compares with; the draft changes as its lines are accepted.
  const [copiedStops, setCopiedStops] = useState<RouteDraftStop[] | null>(null);
  const importDraftStopsRef = useRef<DraftStop[] | null>(null);
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
  const [isUploading, setIsUploading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Bumped whenever the drafts change, so a slow locate of an earlier parse is dropped.

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

  const importCopySourcesForCustomer = copyStopSources
    .filter((route) => route.customerId === importCustomerId)
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

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
  const latestCopySourceId = importCopySourcesForCustomer[0]?.id ?? '';
  const copySourceIsTheirs = importCopySourcesForCustomer.some((route) => route.id === importCopySourceRouteId);
  const preselectedFor = useRef('');
  useEffect(() => {
    if (!fromRecord || !importCustomerId || !latestCopySourceId || preselectedFor.current === importCustomerId) return;
    preselectedFor.current = importCustomerId;
    // Not one already chosen for this Customer, but a stale one from the Customer shown before the suggested one.
    if (!copySourceIsTheirs) setImportCopySourceRouteId(latestCopySourceId);
  }, [fromRecord, importCustomerId, latestCopySourceId, copySourceIsTheirs]);

  useEffect(() => {
    if (!importRouteCodeTyped) setImportRouteCode(suggestRouteCode(importScheduledDate));
  }, [suggestRouteCode, importScheduledDate, importRouteCodeTyped]);

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

  // The suggested Customer, once both it and the Customers have loaded.
  useEffect(() => {
    const suggested = fromRecord?.suggestedCustomerId;
    if (!suggested || !customers.some((customer) => customer.id === suggested)) return;
    setImportCustomerId(suggested);
  }, [fromRecord, customers]);

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
        // Pre-select first customer for import tab
        if (result.length > 0) {
          setImportCustomerId(result[0].id);
        }
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
      route: values,
      stops: values.stops,
      request: routeRequestFor(null),
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

  const handleImportCustomerChange = (customerId: string) => {
    setImportCustomerId(customerId);
    setImportCopySourceRouteId('');
    setImportDraftStops(null);
    setImportDraftSource(null);
    setParseWarnings([]);
    setImportError(null);
  };

  // ── Import tab handlers ───────────────────────────────────────────────────

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportFile(e.target.files?.[0] ?? null);
  };

  const routeRequestProblem = () => {
    if (needsRequester && !requesterName.trim()) return 'Enter the name of the person who asked for this Route, under Route Request.';
    if (!fromRecord && !requestedAt) return 'Enter when the Route was requested, under Route Request.';
    return null;
  };

  // Links the email, or records the upload, as the new Route's Route Request.
  const routeRequestFor = (file: File | null) => {
    const name = requesterName.trim();
    return {
      fromRecordId: fromRecord?.id ?? null,
      requester: name ? { name, email: requesterEmail } : null,
      requestedAt: new Date(requestedAt).toISOString(),
      note: fromRecord ? null : requestNote,
      file: fromRecord ? null : file,
    };
  };

  const handleCopyStopsToImport = async () => {
    if (!importCopySourceRouteId) {
      setImportError('Select a previous route to copy from.');
      return;
    }

    setCopyingImportStops(true);
    setImportError(null);
    try {
      const copiedStops = await handleCopyStopsFromRoute(importCopySourceRouteId);
      if (copiedStops.length === 0) {
        setImportError('The selected route has no stops to copy.');
        return;
      }

          resetDiffDecisions();
      setCopiedStops(copiedStops);
      setImportDraftStops(copiedStops.map((stop, i) => ({ ...stop, copiedFrom: i })));
      setImportDraftSource('copy');
      setParseWarnings([]);
    } catch {
      setImportError('Could not copy stops from the selected route.');
    } finally {
      setCopyingImportStops(false);
    }
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
            const placed = instructionLines([{ text, address: instruction.address }], importDraftStopsRef.current ?? [], null)[0];
            if (placed.target.kind !== 'stop') continue;
            const target = importDraftStopsRef.current![placed.target.draftIndex];
            instructionStopsRef.current.set(line.index, { copiedFrom: target.copiedFrom, fromRow: target.fromRow });
            setImportDraftStops((draft) =>
              draft ? draft.map((stop) => (stop === target ? { ...stop, notes: addToNote(stop.notes, text) } : stop)) : draft
            );
          }
        } else if (previous === 'accepted') {
          if (!instruction.address) {
            setAcceptedRouteInstructions(({ [line.index]: _taken, ...rest }) => rest);
          } else {
            const where = instructionStopsRef.current.get(line.index);
            setImportDraftStops((draft) =>
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
          setImportDraftStops((draft) =>
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
        setImportDraftStops((draft) => {
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
            setImportError(`${row.address} has no suburb that could be found on the map, so it was not added. Add it to the Route once it's created, with the suburb.`);
            continue;
          }
          if (located.unpinned > 0) {
            setParseWarnings((warnings) => [...warnings, `${row.address} couldn't be found on the map and will be created without a pin. It still appears in Property History.`]);
          }
          setImportDraftStops((draft) => (draft ? addToDraft(draft, { ...stop, fromRow: line.index }) : draft));
        } finally {
          setLineBusy(key, false);
        }
      } else if (previous === 'accepted' && line.kind === 'drop') {
        const original = copiedStops?.[line.index];
        const stop = droppedStopsRef.current.get(line.index) ?? (original && { ...original, copiedFrom: line.index });
        if (stop) setImportDraftStops((draft) => (draft ? restoreToDraft(draft, stop) : draft));
      } else if (previous === 'accepted') {
        setImportDraftStops((draft) => (draft ? removeAddFromDraft(draft, line.index) : draft));
      }
      setDiffDecision(key, decision);
    }
  };

  // The copy is only a copy while it is the draft's source; reading the Schedule again starts the lines over.
  useEffect(() => {
    if (importDraftSource !== 'copy') {
      setCopiedStops(null);
      resetDiffDecisions();
    }
  }, [importDraftSource]);

  const lastReadAtRef = useRef<string | null>(null);
  useEffect(() => {
    const readAt = scheduleReading?.readAt ?? null;
    const changed = lastReadAtRef.current !== null && readAt !== lastReadAtRef.current;
    lastReadAtRef.current = readAt;
    if (changed && copiedStops && Object.keys(diffDecisionsRef.current).length > 0) {
      resetDiffDecisions();
      setImportDraftStops(copiedStops.map((stop, i) => ({ ...stop, copiedFrom: i })));
    }
  }, [scheduleReading, copiedStops]);

  useEffect(() => {
    importDraftStopsRef.current = importDraftStops;
  }, [importDraftStops]);

  // The accepted route-wide instructions as the Route's customer instructions (lib/routeInstructions.ts), in the reading's order.
  const customerInstructionsToCreate = () =>
    Object.entries(acceptedRouteInstructions)
      .sort(([a], [b]) => Number(a) - Number(b))
      .reduce<string | undefined>((feed, [, text]) => appendRouteInstruction(feed, { text }), undefined);

  const handleImportSubmit = async () => {
    if (!importCustomerId) { setImportError('Select a customer.'); return; }
    if (!importRouteCode.trim()) { setImportError('Enter a route ID.'); return; }
    if (!importScheduledDate) { setImportError('Choose a placement date.'); return; }
    const pickupProblem = pickupDateProblem(importScheduledDate, importPickupDate);
    if (pickupProblem) { setImportError(pickupProblem); return; }
    if (!importDraftStops || importDraftStops.length === 0) {
      setImportError('Copy stops from a previous route or parse an uploaded schedule file first.');
      return;
    }
    const requestProblem = routeRequestProblem();
    if (requestProblem) { setImportError(requestProblem); return; }

    setIsUploading(true);
    setImportError(null);

    try {
      const dateBlock = await checkRouteDateBlocked(importCustomerId, importScheduledDate);
      if (dateBlock.blocked) {
        const customerName = customers.find((c) => c.id === importCustomerId)?.name ?? 'This customer';
        setImportError(
          dateBlock.type === 'no_drivers'
            ? `Null Device has no operators available on ${importScheduledDate}${dateBlock.reason ? ` (${dateBlock.reason})` : ''}. Choose another date, or clear the block on the service calendar.`
            : `${customerName}'s agency is closed on ${importScheduledDate}${dateBlock.reason ? ` (${dateBlock.reason})` : ''}. Choose another date.`
        );
        setIsUploading(false);
        return;
      }

      // The Route Request is linked or recorded with the uploaded Schedule.
      const result = await createRouteWithStops({
        route: {
          routeCode: importRouteCode,
          customerId: importCustomerId,
          scheduledDate: importScheduledDate,
          pickupDate: importPickupDate,
          notes: importNotes,
          customerInstructions: customerInstructionsToCreate(),
        },
        stops: importDraftStops,
        request: routeRequestFor(importFile),
      });
      if (!result.ok) {
        setImportError(result.error);
        setIsUploading(false);
        return;
      }

      router.push(`/administrator/routes/detail?id=${result.routeId}`);
    } catch (err) {
      console.error('Import error:', err);
      setImportError(err instanceof DataError ? err.message : 'An unexpected error occurred during import.');
      setIsUploading(false);
    }
  };

  const handleDraftNoteChange = (draftIndex: number, note: string) => {
    setImportDraftStops((prev) => (prev ? prev.map((stop, i) => (i === draftIndex ? withDraftStopNote(stop, note) : stop)) : prev));
  };

  const previewColumns: DataColumn<RouteDraftStop & { id: number; seq: number }>[] = [
    { key: 'seq', header: '#', render: (stop) => stop.seq },
    { key: 'address', header: 'Address', render: (stop) => stop.address },
    { key: 'signs', header: 'Signs', render: (stop) => stop.numberOfSigns },
    { key: 'agent', header: 'Agent', render: (stop) => stop.agent },
    {
      key: 'pin',
      header: 'Map pin',
      render: (stop) =>
        typeof stop.latitude === 'number' ? null : <span className={styles.noPinBadge}>No pin</span>,
    },
    {
      key: 'flags',
      header: 'Flags',
      render: (stop) => (stop.isAuction ? <span className={styles.auctionBadge}>Auction</span> : null),
    },
    {
      // Each draft's note, to keep, change or clear (withDraftStopNote).
      key: 'notes',
      header: 'Notes',
      render: (stop) => (
        <Input
          size="sm"
          className={styles.draftNoteInput}
          aria-label={`Notes for stop ${stop.seq}, ${stop.address}`}
          value={stop.notes ?? ''}
          // A preview row's id is its position in the draft list.
          onChange={(e) => handleDraftNoteChange(stop.id, e.target.value)}
          disabled={isUploading}
        />
      ),
    },
  ];

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
            <Card title="Route Request">
              {fromRecordError && <div className={styles.warningsBanner}>{fromRecordError}</div>}
              {fromRecord ? (
                <details className={styles.fromRecord} open>
                  <summary>
                    Creating from <strong>{recordTitle(fromRecord)}</strong> from {requesterLabel(fromRecord)}. It becomes this
                    Route&rsquo;s Route Request.
                  </summary>
                  <RouteRequestView record={fromRecord} />
                </details>
              ) : (
                <p className={styles.importHint}>
                  Who asked for this Route. An uploaded Schedule is kept with it; with neither, the Route has no Route Request yet.
                </p>
              )}
              {fromRecord && <ScheduleReadingPanel record={fromRecord} onReading={setScheduleReading} />}
              {(!fromRecord || needsRequester) && (
                <div className={styles.fieldsStack}>
                  <RequesterFields
                    idPrefix="request"
                    name={requesterName}
                    email={requesterEmail}
                    required={needsRequester}
                    onName={setRequesterName}
                    onEmail={setRequesterEmail}
                  />
                  {!fromRecord && (
                    <Field label="Requested at" htmlFor="request-requested-at">
                      <Input
                        id="request-requested-at"
                        type="datetime-local"
                        value={requestedAt}
                        onChange={(e) => setRequestedAt(e.target.value)}
                      />
                    </Field>
                  )}
                  {!fromRecord && (
                    <Field label="Note (optional)" htmlFor="request-note" hint="e.g. what was asked for on the phone">
                      <Input id="request-note" value={requestNote} onChange={(e) => setRequestNote(e.target.value)} />
                    </Field>
                  )}
                </div>
              )}
            </Card>

            <Tabs
              items={[
                { id: 'import', label: 'Import from Schedule' },
                { id: 'manual', label: 'Manual Entry' },
              ]}
              value={activeTab}
              onChange={(id) => setActiveTab(id as 'import' | 'manual')}
            />

            {/* Import tab */}
            {activeTab === 'import' && (
              <Card>
                <p className={styles.importHint}>
                  Copy stops from a previous route first. Uploading a schedule file is optional and will only be used when copied stops are not active.
                </p>

                <div className={styles.fieldsStack}>
                  <Field label="Customer" htmlFor="import-customer">
                    <Select
                      id="import-customer"
                      value={importCustomerId}
                      onChange={(e) => handleImportCustomerChange(e.target.value)}
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Copy Stops From Previous Route" htmlFor="import-copy-source">
                    <div className={styles.fileRow}>
                      <Select
                        id="import-copy-source"
                        value={importCopySourceRouteId}
                        onChange={(e) => {
                          const nextRouteId = e.target.value;
                          setImportCopySourceRouteId(nextRouteId);
                          if (!nextRouteId && importDraftSource === 'copy') {
                            setImportDraftStops(null);
                            setImportDraftSource(null);
                          }
                          setImportError(null);
                        }}
                        disabled={!importCustomerId || importCopySourcesForCustomer.length === 0 || isUploading || copyingImportStops}
                      >
                        <option value="">
                          {importCopySourcesForCustomer.length > 0 ? 'Choose a route...' : 'No previous routes available'}
                        </option>
                        {importCopySourcesForCustomer.map((route) => (
                          <option key={route.id} value={route.id}>{route.label}</option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        loading={copyingImportStops}
                        onClick={handleCopyStopsToImport}
                        disabled={!importCopySourceRouteId || isUploading || copyingImportStops}
                      >
                        {copyingImportStops ? 'Copying...' : 'Copy Stops'}
                      </Button>
                    </div>
                  </Field>

                  <Field label="Route Notes (optional)" htmlFor="import-notes">
                    <Input
                      id="import-notes"
                      value={importNotes}
                      onChange={(e) => setImportNotes(e.target.value)}
                      placeholder="e.g. Open houses 28 March 2026"
                    />
                  </Field>

                  <Field label="Route ID" htmlFor="import-route-code" {...routeCodeFeedback(existingRouteCodes, importRouteCode)}>
                    <Input
                      id="import-route-code"
                      value={importRouteCode}
                      onChange={(e) => {
                        setImportRouteCodeTyped(true);
                        setImportRouteCode(e.target.value);
                      }}
                      placeholder="e.g. W18-26-001"
                    />
                  </Field>

                  <Field label="Placement date" htmlFor="import-scheduled-date" required>
                    <Input
                      id="import-scheduled-date"
                      type="date"
                      value={importScheduledDate}
                      onChange={(e) => setImportScheduledDate(e.target.value)}
                    />
                  </Field>

                  <Field label="Pickup date" htmlFor="import-pickup-date" required hint={importPickupWarning}>
                    <Input
                      id="import-pickup-date"
                      type="date"
                      value={importPickupDate}
                      onChange={(e) => chooseImportPickupDate(e.target.value)}
                    />
                  </Field>

                  {!fromRecord && (
                    <Field label="Upload Schedule File" hint="PDF, CSV, TXT, kept with the Route Request. Stops are copied from a previous Route or entered by hand">
                      <div className={styles.fileRow}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.csv,.txt"
                          style={{ display: 'none' }}
                          onChange={handleFileSelected}
                        />
                        <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                          {importFile ? importFile.name : 'Choose File'}
                        </Button>
                        {importFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setImportFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </Field>
                  )}
                </div>

                {parseWarnings.length > 0 && (
                  <div className={styles.warningsBanner}>
                    {parseWarnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                )}

                {importError && <div className={styles.errorBanner}>{importError}</div>}

                {importDraftSource === 'copy' && copiedStops && scheduleReading && (
                  <ScheduleDiffPanel
                    reading={scheduleReading}
                    stops={copiedStops}
                    decisions={diffDecisions}
                    draftStops={importDraftStops ?? undefined}
                    standingInstructions={customers.find((customer) => customer.id === importCustomerId)?.standingInstructions}
                    busy={diffBusy}
                    onDecide={(lines, decision) => void decideDiffLines(lines, decision)}
                  />
                )}
                {importDraftSource === 'copy' && importDraftStops && fromRecord && !scheduleReading && scheduleAttachmentIndex(fromRecord.attachments) !== null && (
                  <p className={styles.importHint}>Read the Schedule, under Route Request, to see what changed since this Route.</p>
                )}

                {importDraftStops && importDraftStops.length > 0 && (
                  <div>
                    <p className={styles.previewHeader}>
                      <strong>{importDraftStops.length} stops ready</strong>. Review before creating route
                    </p>
                    <DataTable<RouteDraftStop & { id: number; seq: number }>
                      columns={previewColumns}
                      rows={importDraftStops.map((stop, i) => ({ ...stop, id: i, seq: i + 1 }))}
                    />
                    <Button
                      type="button"
                      loading={isUploading}
                      onClick={handleImportSubmit}
                      disabled={isUploading}
                      style={{ marginTop: 'var(--space-5)' }}
                    >
                      {isUploading ? 'Creating Route...' : `Create Route (${importDraftStops.length} stops)`}
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* Manual entry tab */}
            {activeTab === 'manual' && (
              <RouteForm
                customers={customers}
                suggestRouteCode={suggestRouteCode}
                routeCodeFeedback={(code) => routeCodeFeedback(existingRouteCodes, code)}
                stops={formStops}
                onStopsChange={setFormStops}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                isSubmitting={isSubmitting}
                error={submitError}
                copyStopSources={copyStopSources}
                onCopyStopsFromSource={handleCopyStopsFromRoute}
                onCheckDateBlock={checkRouteDateBlocked}
              />
            )}
          </>
        )}
      </div>
    </OperatorRoute>
  );
}
