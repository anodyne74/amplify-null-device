'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { RouteForm, type RouteDraftStop } from '@/app/operator/components/RouteForm';
import { RequesterFields, RouteRequestView, recordTitle } from '@/app/administrator/components/RouteRequests';
import { pickStopLocationFields } from '@/lib/locationPrecision';
import { nextRouteCode, type RouteCodeEntry } from '@/lib/routeCode';
import { routeCodeFeedback } from '@/app/administrator/components/routeCodeFeedback';
import { checkRouteDateBlocked } from '@/lib/routeScheduleGuard';
import type { StandingPickupDay } from '@/amplify/types';
import { locateDraftStops } from '@/lib/stopLocation';
import { useScheduleDiffDraft } from '@/lib/useScheduleDiffDraft';
import { displayNotes } from '@/lib/stopProgress';
import { ScheduleDiffPanel } from './ScheduleDiffPanel';
import { appendRouteInstruction } from '@/lib/routeInstructions';
import type { DraftMarks } from '@/lib/scheduleDiffDraft';
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
  const [formCustomerId, setFormCustomerId] = useState('');
  // The Stops as copied, which the Schedule Diff compares with; the draft changes as its lines are accepted.
  const [copiedStops, setCopiedStops] = useState<RouteDraftStop[] | null>(null);

  // The Route Request (#359): the inbox record this Route is created from, or
  // one recorded by hand from the uploaded Schedule and an optional requester.
  const [fromRecord, setFromRecord] = useState<RouteRequestRecord | null>(null);
  const [fromRecordError, setFromRecordError] = useState<string | null>(null);
  // What the Schedule says, as shown by the Schedule reading panel; compared with the copied Stops (ADR 0014).
  const [scheduleReading, setScheduleReading] = useState<ScheduleReading | null>(null);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const needsRequester = Boolean(fromRecord?.loggedByStaff);
  const diffDraft = useScheduleDiffDraft<DraftStop>({
    reading: scheduleReading,
    copiedStops,
    draftStops: formStops,
    setStops: setFormStops,
    locate: (drafts) => locateDraftStops<RouteDraftStop>(drafts),
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
      diffDraft.reset();
      setCopiedStops(copied);
    }
    return copied.map((stop, i) => ({ ...stop, copiedFrom: i }));
  };

  const handleFormCustomerChange = (customerId: string) => {
    setFormCustomerId(customerId);
    // Stops copied for one Customer, and the lines decided against them, are not another's.
    if (copiedStops) {
      diffDraft.reset();
      setCopiedStops(null);
      setFormStops([]);
    }
  };

  const routeRequestProblem = () =>
    needsRequester && !requesterName.trim() ? 'Enter the name of the person who asked for this Route, in the panel above.' : null;

  // Links the email as the new Route's Route Request. A Route with no email has none (ADR 0015).
  const routeRequestFor = () => {
    const name = requesterName.trim();
    return { fromRecordId: fromRecord?.id ?? null, requester: name ? { name, email: requesterEmail } : null };
  };

  // The accepted route-wide instructions as the Route's customer instructions (lib/routeInstructions.ts), in the reading's order.
  const customerInstructionsToCreate = () =>
    Object.entries(diffDraft.acceptedRouteInstructions)
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
          {diffDraft.warnings.length > 0 && (
            <div className={styles.warningsBanner}>
              {diffDraft.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}
          {diffDraft.error && <div className={styles.errorBanner}>{diffDraft.error}</div>}
          {copiedStops && scheduleReading && diffDraft.readingDiff && (
            <ScheduleDiffPanel
              reading={scheduleReading}
              readingDiff={diffDraft.readingDiff}
              stops={copiedStops}
              decisions={diffDraft.decisions}
              draftStops={formStops}
              standingInstructions={customers.find((customer) => customer.id === formCustomerId)?.standingInstructions}
              busy={diffDraft.busy}
              onDecide={(lines, decision) => void diffDraft.decide(lines, decision)}
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

            {fromRecordError && <div className={styles.warningsBanner}>{fromRecordError}</div>}

            {routeForm}
          </>
        )}
      </div>
    </OperatorRoute>
  );
}
