'use client';

import { useCallback, useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { dismissRouteRequest, listRouteRequests, openRouteRequestFile, type RouteRequestRow } from '@/lib/routeRequests';
import styles from './page.module.css';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

function sender(row: RouteRequestRow): string {
  return row.request.fromName ? `${row.request.fromName} <${row.request.fromAddress}>` : row.request.fromAddress;
}

function formatSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Saves a file from a signed link; the link itself tells the browser to download it. */
function download(url: string) {
  const link = document.createElement('a');
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * The request inbox (#358, ADR 0008): every email sent to requests@, newest
 * first. Unlinked ones are listed by default; dismissed ones -- never deleted
 * -- can be shown too. Linking one to a Route comes in part 2.
 */
export default function AdministratorRouteRequestsPage() {
  const [rows, setRows] = useState<RouteRequestRow[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listRouteRequests();
    setRows(data);
    setLoadError(error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((row) => row.request.status === 'unlinked' || (showDismissed && row.request.status === 'dismissed'));
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

        <label className={styles.filter}>
          <input type="checkbox" checked={showDismissed} onChange={(event) => setShowDismissed(event.target.checked)} />
          Show dismissed
        </label>

        {loading ? (
          <p className={styles.note}>Loading the inbox…</p>
        ) : loadError ? (
          <p className="nd-badge nd-badge--danger">{loadError}</p>
        ) : visible.length === 0 ? (
          <Card>
            <p className={styles.emptyState}>No emails to review. Emails sent to requests@ appear here.</p>
          </Card>
        ) : (
          <div className={styles.layout}>
            <Card title={`${visible.length} ${visible.length === 1 ? 'email' : 'emails'}`}>
              <ul className={styles.queue}>
                {visible.map((row) => (
                  <li key={row.request.id}>
                    <button
                      type="button"
                      className={styles.queueItem}
                      aria-current={row.request.id === selected?.request.id ? 'true' : undefined}
                      onClick={() => setSelectedId(row.request.id)}
                    >
                      <span className={styles.queueTitle}>{row.request.subject || '(no subject)'}</span>
                      <span className={styles.note}>
                        {row.request.fromName || row.request.fromAddress} · {formatWhen(row.request.sentAt)}
                      </span>
                      <RowBadges row={row} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            {selected && (
              <RouteRequestCard key={selected.request.id} row={selected} onDismissed={(reason) => markDismissed(selected.request.id, reason)} />
            )}
          </div>
        )}
      </div>
    </OperatorRoute>
  );
}

function RowBadges({ row }: { row: RouteRequestRow }) {
  return (
    <span className={styles.badges}>
      {row.request.status === 'dismissed' && <Badge size="sm">Dismissed</Badge>}
      {row.senderNotVerified && <Badge tone="danger" size="sm">Sender not verified</Badge>}
      {row.request.loggedByStaff && <Badge tone="info" size="sm">Logged by staff</Badge>}
      {row.suggestedCustomerName && <span className={styles.note}>Suggested: {row.suggestedCustomerName}</span>}
    </span>
  );
}

function RouteRequestCard({ row, onDismissed }: { row: RouteRequestRow; onDismissed: (reason: string) => void }) {
  const { request } = row;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(file: number | 'raw') {
    setError(null);
    try {
      download(await openRouteRequestFile(request.id, file));
    } catch (err) {
      console.error('Opening the file failed:', err);
      setError('Could not open the file.');
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    const result = await dismissRouteRequest(request.id, reason);
    setBusy(false);
    if (result.ok) onDismissed(reason.trim());
    else setError(result.error);
  }

  const attachments = request.attachments ?? [];

  return (
    <Card title={request.subject || '(no subject)'} subtitle={`From ${sender(row)}`}>
      <div className={styles.detail}>
        {error && <p className="nd-badge nd-badge--danger">{error}</p>}

        <RowBadges row={row} />
        <p className={styles.note}>
          Sent {formatWhen(request.sentAt)} · received {formatWhen(request.receivedAt)}
        </p>
        {row.senderNotVerified && (
          <p className={styles.note}>
            The sender&apos;s mail server failed a check that it may send for this address, so this email may not be from who it says.
          </p>
        )}

        <pre className={styles.body}>{request.bodyText || '(no text)'}</pre>

        <div className={styles.section}>
          <p className={styles.note}>
            {attachments.length === 0 ? 'No attachments.' : `${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`}
          </p>
          {attachments.length > 0 && (
            <ul className={styles.files}>
              {attachments.map((attachment, index) =>
                attachment ? (
                  <li key={attachment.key}>
                    <Button size="sm" variant="secondary" onClick={() => void open(index)}>
                      {attachment.filename}
                    </Button>
                    <span className={styles.note}>
                      {formatSize(attachment.size)}
                      {attachment.inline ? ' · inline' : ''}
                    </span>
                  </li>
                ) : null
              )}
            </ul>
          )}
          <div className={styles.actions}>
            <Button size="sm" variant="secondary" onClick={() => void open('raw')}>
              Download original email
            </Button>
          </div>
        </div>

        <div className={styles.section}>
          {request.status === 'dismissed' ? (
            <p className={styles.note}>
              Dismissed{request.dismissedAt ? ` ${formatWhen(request.dismissedAt)}` : ''}: {request.dismissedReason}
            </p>
          ) : (
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
          )}
        </div>
      </div>
    </Card>
  );
}
