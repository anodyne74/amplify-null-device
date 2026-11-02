'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import {
  LinkRouteRequestForm,
  ManualRouteRequestForm,
  ROLE_LABELS,
  RouteRequestBadges,
  RouteRequestView,
  formatWhen,
  recordTitle,
} from '@/app/administrator/components/RouteRequests';
import {
  listRouteRequests,
  listRouteRequestsForRoute,
  unlinkRouteRequest,
  type RouteRequestRecord,
} from '@/lib/routeRequests';
import type { DiffStop } from '@/lib/scheduleDiff';
import { acceptAmendmentAdd, acceptAmendmentDrop, canAcceptLines, LOAD_STARTED_MESSAGE, rejectAmendmentLine, type LineResult } from '@/lib/amendmentLines';
import type { AmendmentViewLine } from '@/app/administrator/routes/new/AmendmentDiffView';
import { ScheduleReadingPanel } from '@/app/administrator/routes/new/ScheduleReadingPanel';
import styles from './RouteRequests.module.css';

/**
 * A Route's Requests section (#359, ADR 0008): its Route Request and its
 * Amendments in the order they were sent, each with everything captured, and
 * ways to link another from the Request inbox, record one by hand, or unlink.
 */
type CardStop = Omit<DiffStop, 'address'> & { id?: string; address?: string | null; sequence?: number | null; agent?: string | null };

export function RouteRequestsCard({
  routeId,
  customerId,
  stops,
  route,
  onStopsChanged,
}: {
  routeId: string;
  customerId: string | null;
  stops?: CardStop[];
  /** Where the Route is in its Sign Run: Amendment lines can be accepted only until Load starts. */
  route?: { loadStartedAt?: string | null; status?: string | null };
  /** Told when accepting a line changed the Route's Stops, so the page can reload them. */
  onStopsChanged?: () => void;
}) {
  // A Stop with no address matches nothing, so it is left out.
  const routeStops = useMemo(() => stops?.flatMap((stop) => (stop.address ? [{ ...stop, address: stop.address }] : [])), [stops]);
  const [records, setRecords] = useState<RouteRequestRecord[]>([]);
  const [inbox, setInbox] = useState<RouteRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<'link' | 'manual' | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  // Why a line could not be accepted, or a warning about one that was; kept apart from `error`, which every reload resets.
  const [lineMessage, setLineMessage] = useState<string | null>(null);
  const [busyLines, setBusyLines] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    const [own, all] = await Promise.all([listRouteRequestsForRoute(routeId), listRouteRequests()]);
    setRecords(own.data);
    setInbox(all.data.filter((row) => row.request.status === 'unlinked').map((row) => row.request));
    setError(own.error ?? all.error ?? null);
    setLoading(false);
  }, [routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasRouteRequest = records.some((record) => record.role === 'request');

  async function decide(record: RouteRequestRecord, accepted: boolean, line: AmendmentViewLine) {
    const key = `${line.change}:${line.row.address}`;
    setBusyLines((current) => new Set(current).add(key));
    setLineMessage(null);
    try {
      const common = { recordId: record.id, decisions: record.amendmentDecisions, route: { id: routeId, customerId, ...route } };
      let result: LineResult;
      if (!accepted) {
        result = await rejectAmendmentLine({ recordId: record.id, decisions: record.amendmentDecisions, change: line.change, address: line.row.address });
      } else if (line.change === 'add') {
        result = await acceptAmendmentAdd({ ...common, stops: routeStops ?? [], row: line.row, address: line.address });
      } else {
        const stop = line.stop as { id?: string; address: string };
        const stopsWithIds = (routeStops ?? []).flatMap((item) => (item.id ? [{ id: item.id, sequence: item.sequence }] : []));
        result = stop.id
          ? await acceptAmendmentDrop({ ...common, stops: stopsWithIds, stop: { id: stop.id, address: stop.address }, address: line.row.address })
          : { ok: false, error: `Could not find ${stop.address} on the Route.` };
      }
      if (!result.ok) setLineMessage(result.error);
      else if (result.warning) setLineMessage(result.warning);
      if (result.ok && accepted) onStopsChanged?.();
      await load();
    } finally {
      setBusyLines((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  function added() {
    setAdding(null);
    void load();
  }

  async function unlink(recordId: string) {
    setUnlinkingId(recordId);
    setError(null);
    const result = await unlinkRouteRequest(recordId);
    setUnlinkingId(null);
    if (result.ok) void load();
    else setError(result.error);
  }

  return (
    <Card title="Requests" subtitle="The Route Request and any Route Amendments, in the order they were sent">
      <div className={styles.view}>
        {error && <p className="nd-badge nd-badge--danger">{error}</p>}
        {lineMessage && <p className="nd-badge nd-badge--danger" role="alert">{lineMessage}</p>}
        {loading ? (
          <p className={styles.note}>Loading requests…</p>
        ) : records.length === 0 ? (
          <p className={styles.note}>No Route Request yet.</p>
        ) : (
          records.map((record) => (
            <details key={record.id} className={styles.record}>
              <summary>
                <strong>{record.role ? ROLE_LABELS[record.role] : 'Request'}</strong> · {recordTitle(record)} ·{' '}
                {formatWhen(record.sentAt)} <RouteRequestBadges record={record} />
              </summary>
              <RouteRequestView record={record} />
              {record.role === 'amendment' && <ScheduleReadingPanel
                  record={record}
                  stops={routeStops}
                  lines={
                    route
                      ? {
                          canAccept: canAcceptLines(route),
                          busy: busyLines,
                          loadMessage: LOAD_STARTED_MESSAGE,
                          onAccept: (line) => void decide(record, true, line),
                          onReject: (line) => void decide(record, false, line),
                        }
                      : undefined
                  }
                />}
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" disabled={unlinkingId === record.id} onClick={() => void unlink(record.id)}>
                  Unlink
                </Button>
              </div>
            </details>
          ))
        )}

        <div className={styles.actions}>
          <Button size="sm" variant={adding === 'link' ? 'primary' : 'secondary'} onClick={() => setAdding(adding === 'link' ? null : 'link')}>
            Link from the inbox
          </Button>
          <Button size="sm" variant={adding === 'manual' ? 'primary' : 'secondary'} onClick={() => setAdding(adding === 'manual' ? null : 'manual')}>
            Record by hand
          </Button>
        </div>
        {adding === 'link' && (
          <LinkRouteRequestForm mode="pick-record" records={inbox} routeId={routeId} routeHasRequest={hasRouteRequest} onLinked={added} />
        )}
        {adding === 'manual' && (
          <ManualRouteRequestForm routeId={routeId} customerId={customerId} routeHasRequest={hasRouteRequest} onRecorded={added} />
        )}
      </div>
    </Card>
  );
}
