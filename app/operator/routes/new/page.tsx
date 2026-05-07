'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { RouteForm, type RouteDraftStop } from '@/app/operator/components/RouteForm';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { createRoute, createStop } from '@/lib/queries';
import { parseScheduleText, type ParsedStop } from '@/lib/parseSchedule';
import styles from './page.module.css';

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
  const result = await listAllRoutes({ limit: 500 });
  if (result.errors && result.errors.length > 0) {
    return `${prefix}-001`;
  }

  const used = new Set<number>();
  (result.data as Array<{ routeCode?: string | null }>).forEach((route) => {
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

export default function NewRoutePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; email: string; addressLine1?: string | null }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [manualRouteCode, setManualRouteCode] = useState('');
  const [importRouteCode, setImportRouteCode] = useState('');
  const [routeCodeInitialized, setRouteCodeInitialized] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'import' | 'manual'>('import');

  // Import flow state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importCustomerId, setImportCustomerId] = useState('');
  const [importNotes, setImportNotes] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [parsedStops, setParsedStops] = useState<ParsedStop[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
    async function fetchCustomers() {
      setLoadingCustomers(true);
      const result = await listAllCustomers({ limit: 100 });
      if (!result.errors || result.errors.length === 0) {
        setCustomers(
          (result.data as any[]).map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            addressLine1: c.addressLine1 ?? null,
          }))
        );
        // Pre-select first customer for import tab
        if ((result.data as any[]).length > 0) {
          setImportCustomerId((result.data as any[])[0].id);
        }
      }
      setLoadingCustomers(false);
    }
    fetchCustomers();
  }, []);

  const handleSubmit = async (values: {
    routeCode: string;
    customerId: string;
    notes: string;
    stops: RouteDraftStop[];
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createRoute({
        routeCode: values.routeCode.trim(),
        customerId: values.customerId,
        status: 'planned',
        notes: values.notes || undefined,
      });

      if (result.errors && result.errors.length > 0) {
        const msg = (result.errors as Array<{ message?: string }>)
          .map((e) => e.message ?? String(e))
          .join('; ');
        setSubmitError(`Failed to create route: ${msg}`);
        setIsSubmitting(false);
        return;
      }

      if (result.data?.id) {
        for (let index = 0; index < values.stops.length; index += 1) {
          const stop = values.stops[index];
          const stopResult = await createStop({
            routeId: result.data.id,
            customerId: values.customerId,
            sequence: index + 1,
            address: stop.address,
            serviceType: stop.serviceType,
            numberOfSigns: stop.numberOfSigns,
            agent: stop.agent,
            isAuction: stop.isAuction,
            latitude: stop.latitude,
            longitude: stop.longitude,
            formattedAddress: stop.formattedAddress,
            notes: stop.notes,
          });

          if (stopResult.errors && stopResult.errors.length > 0) {
            setSubmitError('Route was created, but one or more stops failed to save.');
            setIsSubmitting(false);
            return;
          }
        }

        router.push(`/operator/routes/detail?id=${result.data.id}`);
      } else {
        setSubmitError('Route created but ID not returned.');
        setIsSubmitting(false);
      }
    } catch {
      setSubmitError('An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/operator/routes');
  };

  // ── Import tab handlers ───────────────────────────────────────────────────

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportText('');
    setParsedStops(null);
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

  const handleParse = () => {
    const text = importText.trim();
    if (!text) { setImportError('Paste the schedule text or upload a file first.'); return; }
    const result = parseScheduleText(text);
    setParsedStops(result.stops);
    const warnings: string[] = [];
    if (result.duplicatesRemoved.length) {
      warnings.push(`Removed ${result.duplicatesRemoved.length} duplicate address(es): ${result.duplicatesRemoved.join(', ')}`);
    }
    if (result.unparsedLines.length) {
      warnings.push(`${result.unparsedLines.length} line(s) could not be parsed and were skipped.`);
    }
    setParseWarnings(warnings);
    setImportError(result.stops.length === 0 ? 'No stops could be extracted. Check the pasted text.' : null);
  };

  const handleImportSubmit = async () => {
    if (!importCustomerId) { setImportError('Select a customer.'); return; }
    if (!importRouteCode.trim()) { setImportError('Enter a route ID.'); return; }
    if (!parsedStops || parsedStops.length === 0) { setImportError('Parse the schedule first.'); return; }

    setIsUploading(true);
    setImportError(null);

    try {
      // 1. Upload file to S3 if one was selected
      let scheduleS3Key: string | undefined;
      if (importFile) {
        const { uploadData } = await import('aws-amplify/storage');
        const tempKey = `schedules/${importCustomerId}/${Date.now()}-${importFile.name}`;
        await uploadData({
          path: tempKey,
          data: importFile,
          options: { contentType: importFile.type || 'text/plain' },
        }).result;
        scheduleS3Key = tempKey;
      }

      // 2. Create route
      const routeResult = await createRoute({
        routeCode: importRouteCode.trim(),
        customerId: importCustomerId,
        status: 'planned',
        notes: importNotes || undefined,
        scheduleS3Key,
      });

      if (routeResult.errors && routeResult.errors.length > 0) {
        const msg = (routeResult.errors as Array<{ message?: string }>)
          .map((e) => e.message ?? String(e)).join('; ');
        setImportError(`Failed to create route: ${msg}`);
        setIsUploading(false);
        return;
      }

      const routeId = routeResult.data?.id;
      if (!routeId) { setImportError('Route created but ID not returned.'); setIsUploading(false); return; }

      // 3. Create stops
      for (let i = 0; i < parsedStops.length; i++) {
        const stop = parsedStops[i];
        const stopResult = await createStop({
          routeId,
          customerId: importCustomerId,
          sequence: i + 1,
          address: stop.address,
          serviceType: 'delivery',
          numberOfSigns: stop.numberOfSigns,
          agent: stop.agent,
          isAuction: stop.isAuction,
        });
        if (stopResult.errors && stopResult.errors.length > 0) {
          setImportError('Route created but one or more stops failed to save.');
          setIsUploading(false);
          return;
        }
      }

      router.push(`/operator/routes/detail?id=${routeId}`);
    } catch (err) {
      console.error('Import error:', err);
      setImportError('An unexpected error occurred during import.');
      setIsUploading(false);
    }
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.container}>
        <h1 className={styles.heading}>Create New Route</h1>

        {loadingCustomers ? (
          <LoadingSpinner message="Loading customers..." />
        ) : (
          <>
            {/* Tab switcher */}
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'import' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('import')}
              >
                Import from Schedule
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'manual' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('manual')}
              >
                Manual Entry
              </button>
            </div>

            {/* Import tab */}
            {activeTab === 'import' && (
              <div className={styles.importPanel}>
                <p className={styles.importHint}>
                  Upload the weekly schedule file or paste the table text copied from Excel/PDF.
                  The parser will extract stops, remove duplicates, and pre-fill the route.
                </p>

                <label className={styles.fieldLabel}>Customer</label>
                <select
                  className={styles.select}
                  value={importCustomerId}
                  onChange={(e) => setImportCustomerId(e.target.value)}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <label className={styles.fieldLabel}>Route Notes (optional)</label>
                <input
                  className={styles.input}
                  value={importNotes}
                  onChange={(e) => setImportNotes(e.target.value)}
                  placeholder="e.g. Open houses 28 March 2026"
                />

                <label className={styles.fieldLabel}>Route ID</label>
                <input
                  className={styles.input}
                  value={importRouteCode}
                  onChange={(e) => setImportRouteCode(e.target.value)}
                  placeholder="e.g. W18-26-001"
                />

                <label className={styles.fieldLabel}>
                  Upload Schedule File
                  <span className={styles.fieldHint}> (PDF, CSV, TXT — stored and linked to route)</span>
                </label>
                <div className={styles.fileRow}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.csv,.txt"
                    style={{ display: 'none' }}
                    onChange={handleFileSelected}
                  />
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {importFile ? importFile.name : 'Choose File'}
                  </button>
                  {importFile && (
                    <button
                      type="button"
                      className={styles.btnClear}
                      onClick={() => {
                        setImportFile(null);
                        setImportText('');
                        setParsedStops(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className={styles.fieldLabel}>
                  Or paste schedule text
                  <span className={styles.fieldHint}> (copy-paste from Excel)</span>
                </label>
                <textarea
                  className={styles.textarea}
                  rows={10}
                  value={importText}
                  onChange={(e) => { setImportText(e.target.value); setParsedStops(null); }}
                  placeholder="TIME  KEY  PROPERTY  WED"
                  spellCheck={false}
                />

                <button
                  type="button"
                  className={styles.btnParse}
                  onClick={handleParse}
                  disabled={!importText.trim()}
                >
                  Preview Stops
                </button>

                {parseWarnings.length > 0 && (
                  <div className={styles.warnings}>
                    {parseWarnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                )}

                {importError && <div className={styles.error}>{importError}</div>}

                {parsedStops && parsedStops.length > 0 && (
                  <div>
                    <p className={styles.previewHeader}>
                      <strong>{parsedStops.length} stops extracted</strong>
                      <span className={styles.fieldHint}> — review before creating route</span>
                    </p>
                    <div className={styles.previewTable}>
                      <div className={styles.previewRowHeader}>
                        <span>#</span>
                        <span>Address</span>
                        <span>Signs</span>
                        <span>Agent</span>
                        <span>Slot</span>
                        <span>Flags</span>
                      </div>
                      {parsedStops.map((stop, i) => (
                        <div key={i} className={styles.previewRow}>
                          <span className={styles.previewSeq}>{i + 1}</span>
                          <span className={styles.previewAddress}>{stop.address}</span>
                          <span>{stop.numberOfSigns}</span>
                          <span>{stop.agent}</span>
                          <span className={styles.previewSlot}>{stop.timeSlot}</span>
                          <span>
                            {stop.isAuction && (
                              <span className={styles.auctionBadge}>Auction</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={styles.btnCreate}
                      onClick={handleImportSubmit}
                      disabled={isUploading}
                    >
                      {isUploading ? 'Creating Route...' : `Create Route (${parsedStops.length} stops)`}
                    </button>
                  </div>
                )}
              </div>
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
              />
            )}
          </>
        )}
      </div>
    </OperatorRoute>
  );
}
