'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
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
import { RouteForm, type RouteDraftStop } from '@/app/operator/components/RouteForm';
import { RequesterFields, RouteRequestView, localNow, recordTitle } from '@/app/administrator/components/RouteRequests';
import { pickStopLocationFields } from '@/lib/locationPrecision';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { parseScheduleText } from '@/lib/parseSchedule';
import { checkRouteDateBlocked } from '@/lib/routeScheduleGuard';
import { locateDraftStops } from '@/lib/stopLocation';
import styles from './page.module.css';
import { listAllRoutes, createRoute, createStopsForRoute, getRouteWithStops } from '@/lib/routes';
import { DataError } from '@/lib/graphqlResult';
import { listAllCustomers } from '@/lib/customers';
import {
  attachNewRouteRequest,
  fetchRouteRequestAttachment,
  getRouteRequest,
  requesterLabel,
  scheduleAttachmentIndex,
  type RouteRequestRecord,
} from '@/lib/routeRequests';

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getExcelStyleWeekPrefix(date = new Date()) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() - 2);

  const yearStart = new Date(shifted.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((shifted.getTime() - yearStart.getTime()) / 86400000) + 1;
  const weekNum = Math.floor((dayOfYear - 1) / 7) + 1;
  const yy = String(shifted.getFullYear()).slice(-2);

  return `W${String(weekNum).padStart(2, '0')}-${yy}`;
}

async function generateNextRouteCode() {
  const prefix = getExcelStyleWeekPrefix();
  const routes = await listAllRoutes().catch(() => null);
  if (!routes) {
    return `${prefix}-001`;
  }

  const used = new Set<number>();
  (routes as Array<{ routeCode?: string | null }>).forEach((route) => {
    const code = route.routeCode;
    if (!code || !code.startsWith(`${prefix}-`)) return;
    const match = code.match(/-(\d{3})$/);
    if (!match) return;
    used.add(Number(match[1]));
  });

  let next = 1;
  while (used.has(next)) next += 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function sanitizeCopiedStopNotes(notes?: string | null) {
  if (!notes) return undefined;

  const cleaned = notes
    .replace(/\[(PLACEMENT_DONE|PICKUP_DONE|PLACEMENT_SKIPPED|PICKUP_SKIPPED):[^\]]*\]/g, ' ')
    .replace(/\[SKIPPED\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || undefined;
}

function normalizeCopiedServiceType(serviceType?: string | null): 'delivery' | 'pickup' | 'inspection' {
  const normalized = serviceType?.trim().toLowerCase();
  if (normalized === 'pickup' || normalized === 'inspection') {
    return normalized;
  }
  return 'delivery';
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
  }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [manualRouteCode, setManualRouteCode] = useState('');
  const [importRouteCode, setImportRouteCode] = useState('');
  const [routeCodeInitialized, setRouteCodeInitialized] = useState(false);
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
  const [importNotes, setImportNotes] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [importDraftStops, setImportDraftStops] = useState<RouteDraftStop[] | null>(null);
  const [importDraftSource, setImportDraftSource] = useState<'copy' | 'upload' | null>(null);
  const [importCopySourceRouteId, setImportCopySourceRouteId] = useState('');
  const [copyingImportStops, setCopyingImportStops] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [locatingProgress, setLocatingProgress] = useState<{ located: number; total: number } | null>(null);
  // Bumped whenever the drafts change, so a slow locate of an earlier parse is dropped.
  const locateRunRef = useRef(0);

  // The Route Request (#359): the inbox record this Route is created from, or
  // one recorded by hand from the uploaded Schedule and an optional requester.
  const [fromRecord, setFromRecord] = useState<RouteRequestRecord | null>(null);
  const [fromRecordError, setFromRecordError] = useState<string | null>(null);
  const [fromAttachment, setFromAttachment] = useState('');
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
    if (routeCodeInitialized) return;

    let cancelled = false;
    void generateNextRouteCode().then((code) => {
      if (cancelled) return;
      setManualRouteCode(code);
      setImportRouteCode(code);
      setRouteCodeInitialized(true);
    });

    return () => {
      cancelled = true;
    };
  }, [routeCodeInitialized]);

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
      const index = scheduleAttachmentIndex(record.attachments);
      if (index !== null) void loadRecordAttachment(record, index);
    });
    return () => {
      cancelled = true;
    };
    // loadRecordAttachment only sets state; it's run once per record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    notes: string;
    stops: RouteDraftStop[];
  }) => {
    const requestProblem = routeRequestProblem();
    if (requestProblem) { setSubmitError(requestProblem); return; }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const route = await createRoute({
        routeCode: values.routeCode.trim(),
        customerId: values.customerId,
        scheduledDate: values.scheduledDate,
        status: 'planned',
        notes: values.notes || undefined,
      });

      const stopResults = await createStopsForRoute(route.id, values.customerId, values.stops);
      const failedStops = stopResults
        .filter((stopResult) => !stopResult.success)
        .map((stopResult) => `#${stopResult.index + 1} (${stopResult.address || 'Unknown address'}): ${stopResult.errorMessage}`);

      if (failedStops.length > 0) {
        setSubmitError(`Route was created, but ${failedStops.length} stop(s) failed to save: ${failedStops.join(' | ')}`);
        setIsSubmitting(false);
        return;
      }

      const attached = await attachRouteRequest(route.id, values.customerId, null);
      if (!attached.ok) {
        setSubmitError(`Route was created, but not linked to its Route Request: ${attached.error} Link it from the Route's Requests.`);
        setIsSubmitting(false);
        return;
      }

      router.push(`/administrator/routes/detail?id=${route.id}`);
    } catch (err) {
      setSubmitError(err instanceof DataError ? err.message : 'An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/administrator/routes');
  };

  const handleCopyStopsFromRoute = async (sourceRouteId: string): Promise<RouteDraftStop[]> => {
    const stops = (await getRouteWithStops(sourceRouteId).catch(() => {
      throw new Error('Failed to load source route stops.');
    }))?.stops ?? [];

    return stops.map((stop) => {
      const rawServiceType = stop.serviceType?.toString().trim().toLowerCase();
      const normalizedLatitude = normalizeOptionalNumber(stop.latitude);
      const normalizedLongitude = normalizeOptionalNumber(stop.longitude);
      const normalizedSigns = normalizeOptionalNumber(stop.numberOfSigns);
      return {
        // The source Stop's precision and address components travel with its pin.
        ...pickStopLocationFields(stop),
        address: stop.address?.trim() || stop.formattedAddress?.trim() || 'Unknown address',
        serviceType: normalizeCopiedServiceType(stop.serviceType),
        numberOfSigns: normalizedSigns,
        agent: stop.agent ?? undefined,
        isAuction: stop.isAuction ?? (rawServiceType === 'auction' ? true : undefined),
        notes: sanitizeCopiedStopNotes(stop.notes),
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
        formattedAddress: stop.formattedAddress ?? undefined,
      };
    });
  };

  const handleImportCustomerChange = (customerId: string) => {
    locateRunRef.current += 1;
    setLocatingProgress(null);
    setImportCustomerId(customerId);
    setImportCopySourceRouteId('');
    setImportDraftStops(null);
    setImportDraftSource(null);
    setParseWarnings([]);
    setImportError(null);
  };

  // ── Import tab handlers ───────────────────────────────────────────────────

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFromAttachment('');
    loadImportFile(e.target.files?.[0] ?? null);
  };

  const loadImportFile = (file: File | null) => {
    setImportFile(file);
    setImportText('');
    setParseWarnings([]);
    setImportError(null);
    if (file) {
      void extractScheduleText(file)
        .then((text) => {
          setImportText(text);
        })
        .catch((error) => {
          console.error('Failed to extract schedule text:', error);
          setImportError('Could not read the uploaded file. PDFs must contain selectable text.');
        });
    }
  };

  const loadRecordAttachment = async (record: RouteRequestRecord, index: number) => {
    const attachment = record.attachments?.[index];
    if (!attachment) return;
    setFromAttachment(String(index));
    try {
      loadImportFile(await fetchRouteRequestAttachment(record.id, index, attachment.filename, attachment.contentType));
    } catch (error) {
      console.error('Failed to load the email attachment:', error);
      setImportError(`Could not load ${attachment.filename} from the email.`);
    }
  };

  const routeRequestProblem = () => {
    if (needsRequester && !requesterName.trim()) return 'Enter the name of the person who asked for this Route, under Route Request.';
    if (!fromRecord && !requestedAt) return 'Enter when the Route was requested, under Route Request.';
    return null;
  };

  // Links the email, or records the upload, as the new Route's Route Request.
  const attachRouteRequest = async (routeId: string, customerId: string, file: File | null) => {
    const name = requesterName.trim();
    return attachNewRouteRequest({
      routeId,
      customerId,
      fromRecordId: fromRecord?.id ?? null,
      requester: name ? { name, email: requesterEmail } : null,
      requestedAt: new Date(requestedAt).toISOString(),
      note: fromRecord ? null : requestNote,
      file: fromRecord ? null : file,
    });
  };

  const handleParse = async () => {
    if (importDraftSource === 'copy') {
      setImportError('Stops are currently sourced from a copied route. Clear copied stops first to use uploaded file stops.');
      return;
    }

    const text = importText.trim();
    if (!text) { setImportError('Upload a schedule file first.'); return; }
    const result = parseScheduleText(text);
    const run = ++locateRunRef.current;
    setImportDraftStops(null);
    setImportDraftSource(null);
    let unpinned = 0;
    let leftOut: string[] = [];
    if (result.stops.length > 0) {
      setImportError(null);
      setLocatingProgress({ located: 0, total: result.stops.length });
      const located = await locateDraftStops<RouteDraftStop>(
        result.stops.map((stop) => ({
          address: stop.address,
          serviceType: 'delivery',
          numberOfSigns: stop.numberOfSigns,
          agent: stop.agent,
          isAuction: stop.isAuction,
        })),
        (count, total) => {
          if (locateRunRef.current === run) setLocatingProgress({ located: count, total });
        }
      );
      if (locateRunRef.current !== run) return;
      setLocatingProgress(null);
      setImportDraftStops(located.stops);
      setImportDraftSource('upload');
      unpinned = located.unpinned;
      leftOut = located.leftOut;
    }
    const warnings: string[] = [];
    if (leftOut.length) {
      warnings.push(
        `Left out ${leftOut.length} stop(s) with no suburb that couldn't be found on the map: ${leftOut.join(', ')}. Add them to the Route once it's created, with the suburb.`
      );
    }
    if (unpinned > 0) {
      warnings.push(
        `${unpinned} stop(s) couldn't be found on the map and will be created without a pin. They still appear in Property History.`
      );
    }
    if (result.duplicatesRemoved.length) {
      warnings.push(`Removed ${result.duplicatesRemoved.length} duplicate address(es): ${result.duplicatesRemoved.join(', ')}`);
    }
    if (result.unparsedLines.length) {
      warnings.push(`${result.unparsedLines.length} line(s) could not be parsed and were skipped.`);
    }
    setParseWarnings(warnings);
    setImportError(result.stops.length === 0 ? 'No stops could be extracted from the uploaded file.' : null);
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

      locateRunRef.current += 1;
      setLocatingProgress(null);
      setImportDraftStops(copiedStops);
      setImportDraftSource('copy');
      setParseWarnings([]);
    } catch {
      setImportError('Could not copy stops from the selected route.');
    } finally {
      setCopyingImportStops(false);
    }
  };

  const handleImportSubmit = async () => {
    if (!importCustomerId) { setImportError('Select a customer.'); return; }
    if (!importRouteCode.trim()) { setImportError('Enter a route ID.'); return; }
    if (!importScheduledDate) { setImportError('Choose a scheduled date.'); return; }
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
            ? `Null Device has no drivers available on ${importScheduledDate}${dateBlock.reason ? ` (${dateBlock.reason})` : ''}. Choose another date, or clear the block on the service calendar.`
            : `${customerName}'s agency is closed on ${importScheduledDate}${dateBlock.reason ? ` (${dateBlock.reason})` : ''}. Choose another date.`
        );
        setIsUploading(false);
        return;
      }

      // 1. Create route
      const { id: routeId } = await createRoute({
        routeCode: importRouteCode.trim(),
        customerId: importCustomerId,
        scheduledDate: importScheduledDate,
        status: 'planned',
        notes: importNotes || undefined,
      });

      // 2. Create stops
      const stopResults = await createStopsForRoute(routeId, importCustomerId, importDraftStops);
      const failedStops = stopResults
        .filter((stopResult) => !stopResult.success)
        .map((stopResult) => `#${stopResult.index + 1} (${stopResult.address || 'Unknown address'}): ${stopResult.errorMessage}`);

      if (failedStops.length > 0) {
        setImportError(`Route created, but ${failedStops.length} stop(s) failed to save: ${failedStops.join(' | ')}`);
        setIsUploading(false);
        return;
      }

      // 3. Link or record its Route Request, with the uploaded Schedule
      const attached = await attachRouteRequest(routeId, importCustomerId, importFile);
      if (!attached.ok) {
        setImportError(`Route created, but not linked to its Route Request: ${attached.error} Link it from the Route's Requests.`);
        setIsUploading(false);
        return;
      }

      router.push(`/administrator/routes/detail?id=${routeId}`);
    } catch (err) {
      console.error('Import error:', err);
      setImportError(err instanceof DataError ? err.message : 'An unexpected error occurred during import.');
      setIsUploading(false);
    }
  };

  const previewColumns: DataColumn<RouteDraftStop & { id: number; seq: number }>[] = [
    { key: 'seq', header: '#', render: (stop) => stop.seq },
    { key: 'address', header: 'Address', render: (stop) => stop.address },
    { key: 'signs', header: 'Signs', render: (stop) => stop.numberOfSigns },
    { key: 'agent', header: 'Agent', render: (stop) => stop.agent },
    { key: 'type', header: 'Type', render: (stop) => stop.serviceType },
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

                  <Field label="Route ID" htmlFor="import-route-code">
                    <Input
                      id="import-route-code"
                      value={importRouteCode}
                      onChange={(e) => setImportRouteCode(e.target.value)}
                      placeholder="e.g. W18-26-001"
                    />
                  </Field>

                  <Field label="Scheduled date" htmlFor="import-scheduled-date" required>
                    <Input
                      id="import-scheduled-date"
                      type="date"
                      value={importScheduledDate}
                      onChange={(e) => setImportScheduledDate(e.target.value)}
                    />
                  </Field>

                  {fromRecord && (fromRecord.attachments ?? []).length > 0 && (
                    <Field label="Schedule from the email" htmlFor="import-from-attachment">
                      <Select
                        id="import-from-attachment"
                        value={fromAttachment}
                        onChange={(e) => {
                          if (e.target.value) void loadRecordAttachment(fromRecord, Number(e.target.value));
                        }}
                        disabled={isUploading}
                      >
                        <option value="">Choose an attachment...</option>
                        {(fromRecord.attachments ?? []).map((attachment, index) =>
                          attachment ? (
                            <option key={attachment.key} value={index}>{attachment.filename}</option>
                          ) : null
                        )}
                      </Select>
                    </Field>
                  )}

                  <Field
                    label="Upload Schedule File"
                    hint={fromRecord ? 'PDF, CSV, TXT — to parse; the email keeps its own files' : 'PDF, CSV, TXT — kept with the Route Request'}
                  >
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
                            locateRunRef.current += 1;
                            setLocatingProgress(null);
                            setImportFile(null);
                            setImportText('');
                            if (importDraftSource === 'upload') {
                              setImportDraftStops(null);
                              setImportDraftSource(null);
                            }
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    {importFile && importText.trim() && (
                      <p className={styles.mutedText}>File text extracted. Preview stops to parse and review.</p>
                    )}
                  </Field>

                  <Button
                    type="button"
                    onClick={() => void handleParse()}
                    loading={locatingProgress !== null}
                    disabled={
                      !importText.trim() ||
                      isUploading ||
                      copyingImportStops ||
                      locatingProgress !== null ||
                      importDraftSource === 'copy'
                    }
                  >
                    Preview Stops
                  </Button>
                  {locatingProgress && (
                    <p className={styles.mutedText} role="status">
                      Finding stops on the map… {locatingProgress.located} of {locatingProgress.total}
                    </p>
                  )}
                </div>

                {parseWarnings.length > 0 && (
                  <div className={styles.warningsBanner}>
                    {parseWarnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                )}

                {importError && <div className={styles.errorBanner}>{importError}</div>}

                {importDraftStops && importDraftStops.length > 0 && (
                  <div>
                    <p className={styles.previewHeader}>
                      <strong>{importDraftStops.length} stops ready</strong> — review before creating route
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
                initialRouteCode={manualRouteCode}
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
