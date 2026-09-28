'use client';

import { useCallback, useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import {
  LinkRouteRequestForm,
  ROLE_LABELS,
  RouteRequestBadges,
  RouteRequestView,
  formatWhen,
  recordTitle,
} from '@/app/administrator/components/RouteRequests';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import {
  dismissRouteRequest,
  listLinkableRoutes,
  listRouteRequests,
  requesterLabel,
  unlinkRouteRequest,
  type LinkableRoute,
  type RouteRequestRow,
} from '@/lib/routeRequests';
import styles from './page.module.css';

/**
 * The request inbox (#358, #359, ADR 0008): every email sent to requests@,
 * newest first. Unlinked ones are listed by default, each ready to link to a
 * Route as its Route Request or an Amendment, to create a Route from, or to
 * dismiss; linked and dismissed ones -- never deleted -- can be shown too.
 */
export default function AdministratorRouteRequestsPage() {
  const [rows, setRows] = useState<RouteRequestRow[]>([]);
  const [routes, setRoutes] = useState<LinkableRoute[]>([]);
  const [showLinked, setShowLinked] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [requests, linkable] = await Promise.all([listRouteRequests(), listLinkableRoutes()]);
    setRows(requests.data);
    setRoutes(linkable.data);
    setLoadError(requests.error ?? linkable.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter(
    ({ request }) =>
      request.status === 'unlinked' || (showLinked && request.status === 'linked') || (showDismissed && request.status === 'dismissed')
  );
  const selected = visible.find((row) => row.request.id === selectedId) ?? visible[0] ?? null;

  function markDismissed(id: string, reason: string) {
    setRows((current) =>
      current.map((row) =>
        row.request.id === id
          ? { ...row, request: { ...row.request, status: 'dismissed', dismissedReason: reason, dismissedAt: new Date().toISOString() } }
          : row
      )
    );
  }

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Request inbox" subtitle="Emails sent to requests@, waiting to be linked to a Route" />

        <div className={styles.filters}>
          <label className={styles.filter}>
            <input type="checkbox" checked={showLinked} onChange={(event) => setShowLinked(event.target.checked)} />
            Show linked
          </label>
          <label className={styles.filter}>
            <input type="checkbox" checked={showDismissed} onChange={(event) => setShowDismissed(event.target.checked)} />
            Show dismissed
          </label>
        </div>

        {loading ? (
          <p className={styles.note}>Loading the inbox…</p>
        ) : loadError ? (
          <p className="nd-badge nd-badge--danger">{loadError}</p>
        ) : visible.length === 0 ? (
          <Card>
            <p className={styles.emptyState}>Nothing to review. Emails sent to requests@ appear here.</p>
          </Card>
        ) : (
          <div className={styles.layout}>
            <Card title={`${visible.length} ${visible.length === 1 ? 'item' : 'items'}`}>
              <ul className={styles.queue}>
                {visible.map((row) => (
                  <li key={row.request.id}>
                    <button
                      type="button"
                      className={styles.queueItem}
                      aria-current={row.request.id === selected?.request.id ? 'true' : undefined}
                      onClick={() => setSelectedId(row.request.id)}
                    >
                      <span className={styles.queueTitle}>{recordTitle(row.request)}</span>
                      <span className={styles.note}>
                        {requesterLabel(row.request)} · {formatWhen(row.request.sentAt)}
                      </span>
                      <RowBadges row={row} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            {selected && (
              <Card key={selected.request.id} title={recordTitle(selected.request)}>
                <div className={styles.detail}>
                  <RowBadges row={selected} />
                  <RouteRequestView record={selected.request} />
                  <RecordActions
                    row={selected}
                    routes={routes}
                    onChanged={() => void load()}
                    onDismissed={(reason) => markDismissed(selected.request.id, reason)}
                  />
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </OperatorRoute>
  );
}

function RowBadges({ row }: { row: RouteRequestRow }) {
  return (
    <RouteRequestBadges
      record={row.request}
      extra={
        <>
          {row.request.status === 'linked' && row.request.role && (
            <span className={styles.note}>
              {ROLE_LABELS[row.request.role]} for {row.routeCode ?? 'a deleted Route'}
            </span>
          )}
          {row.request.status === 'unlinked' && row.suggestedCustomerName && (
            <span className={styles.note}>Suggested: {row.suggestedCustomerName}</span>
          )}
        </>
      }
    />
  );
}

function RecordActions({
  row,
  routes,
  onChanged,
  onDismissed,
}: {
  row: RouteRequestRow;
  routes: LinkableRoute[];
  onChanged: () => void;
  onDismissed: (reason: string) => void;
}) {
  const { request } = row;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setBusy(true);
    setError(null);
    const result = await dismissRouteRequest(request.id, reason);
    setBusy(false);
    if (result.ok) onDismissed(reason.trim());
    else setError(result.error);
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    const result = await unlinkRouteRequest(request.id);
    setBusy(false);
    if (result.ok) onChanged();
    else setError(result.error);
  }

  if (request.status === 'dismissed') {
    return (
      <div className={styles.section}>
        <p className={styles.note}>
          Dismissed{request.dismissedAt ? ` ${formatWhen(request.dismissedAt)}` : ''}: {request.dismissedReason}
        </p>
      </div>
    );
  }

  if (request.status === 'linked') {
    return (
      <div className={styles.section}>
        {error && <p className="nd-badge nd-badge--danger">{error}</p>}
        <p className={styles.note}>
          {request.role ? ROLE_LABELS[request.role] : 'Linked'} for{' '}
          {request.routeId ? <a href={`/administrator/routes/detail?id=${request.routeId}`}>Route {row.routeCode ?? request.routeId.slice(0, 8)}</a> : 'a Route'}
          {request.linkedAt ? `, linked ${formatWhen(request.linkedAt)}` : ''}.
        </p>
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void unlink()}>
            Unlink
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Link to a Route</h3>
        <LinkRouteRequestForm mode="pick-route" record={request} routes={routes} onLinked={onChanged} />
        <div className={styles.actions}>
          <a className="nd-btn nd-btn--secondary nd-btn--sm" href={`/administrator/routes/new?request=${encodeURIComponent(request.id)}`}>
            Create Route from it
          </a>
        </div>
      </div>

      <div className={styles.section}>
        {error && <p className="nd-badge nd-badge--danger">{error}</p>}
        <form
          className={styles.dismissForm}
          onSubmit={(event) => {
            event.preventDefault();
            void dismiss();
          }}
        >
          <Field label="Reason for dismissing" htmlFor={`dismiss-${request.id}`}>
            <input
              id={`dismiss-${request.id}`}
              className="nd-input"
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button size="sm" variant="secondary" type="submit" disabled={busy || !reason.trim()}>
            Dismiss
          </Button>
        </form>
      </div>
    </>
  );
}
