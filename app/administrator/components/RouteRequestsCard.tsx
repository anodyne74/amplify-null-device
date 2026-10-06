'use client';

import { useCallback, useEffect, useState } from 'react';
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
import styles from './RouteRequests.module.css';

/**
 * A Route's Requests section (#359, ADR 0008): its Route Request and its
 * Amendments in the order they were sent, each with everything captured, and
 * ways to link another from the Request inbox, record one by hand, or unlink.
 */
export function RouteRequestsCard({ routeId, customerId }: { routeId: string; customerId: string | null }) {
  const [records, setRecords] = useState<RouteRequestRecord[]>([]);
  const [inbox, setInbox] = useState<RouteRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<'link' | 'manual' | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

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
