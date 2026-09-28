'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import {
  downloadCustomerRouteRequestFile,
  listCustomerRouteRequests,
  type CustomerRouteRequest,
  type CustomerRouteRequestAttachment,
} from '@/lib/customerRouteRequests';
import styles from './RouteRequestsSection.module.css';

const ROLE_LABELS = { request: 'Route Request', amendment: 'Route Amendment' } as const;

// A body longer than this is collapsed to its first few lines until expanded.
const LONG_BODY_CHARACTERS = 280;

function formatSent(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "From Ann <ann@…>", or for one recorded by hand "Requested by Ann", or nothing when no name was entered. */
function requester(entry: CustomerRouteRequest): string | null {
  if (entry.recordedByNullDevice) return entry.requesterName ? `Requested by ${entry.requesterName}` : null;
  if (entry.requesterName && entry.requesterEmail) return `From ${entry.requesterName} <${entry.requesterEmail}>`;
  return `From ${entry.requesterName || entry.requesterEmail || 'unknown sender'}`;
}

function RequestEntry({ entry }: { entry: CustomerRouteRequest }) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = entry.bodyText?.trim() ?? '';
  const long = body.length > LONG_BODY_CHARACTERS || body.split('\n').length > 4;

  async function download(attachment: CustomerRouteRequestAttachment) {
    setDownloading(attachment.index);
    setError(null);
    try {
      const link = document.createElement('a');
      link.href = await downloadCustomerRouteRequestFile(entry.id, attachment.index);
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      setError(`Could not download ${attachment.filename}. Please try again.`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <article className={styles.entry}>
      <p className={styles.heading}>{ROLE_LABELS[entry.role]}</p>
      <p className={styles.meta}>
        {[requester(entry), formatSent(entry.sentAt), entry.recordedByNullDevice ? 'Recorded by Null Device' : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {entry.subject && <p className={styles.subject}>{entry.subject}</p>}
      {body && (
        <>
          <pre className={`${styles.body} ${long && !expanded ? styles.collapsed : ''}`}>{body}</pre>
          {long && (
            <div>
              <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
                {expanded ? 'Show less' : 'Show more'}
              </Button>
            </div>
          )}
        </>
      )}
      {entry.attachments.length > 0 && (
        <ul className={styles.files} aria-label="Files">
          {entry.attachments.map((attachment) => (
            <li key={attachment.index}>
              <Button
                size="sm"
                variant="secondary"
                iconLeft="download"
                disabled={downloading !== null}
                onClick={() => void download(attachment)}
              >
                {attachment.filename}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="nd-badge nd-badge--danger">{error}</p>}
    </article>
  );
}

/**
 * A Route's Requests section for its Customer (#360, ADR 0008): the Route
 * Request, then each Route Amendment in the order sent, with who asked, when,
 * what they said and the files they sent.
 */
export function RouteRequestsSection({ routeId }: { routeId: string }) {
  const [entries, setEntries] = useState<CustomerRouteRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCustomerRouteRequests(routeId)
      .then((requests) => {
        if (!cancelled) setEntries(requests);
      })
      .catch((err) => {
        console.error("Error loading the Route's requests:", err);
        if (!cancelled) setError('Could not load the requests for this route.');
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // Arriving from an invoice's link: the browser's own jump to #requests
  // happened before the section loaded, so go there once it has.
  useEffect(() => {
    if (entries !== null && window.location.hash === '#requests') {
      document.getElementById('requests')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [entries]);

  return (
    <Card id="requests" title="Requests" subtitle="How this route was requested, and any amendments since">
      {error ? (
        <p className="nd-badge nd-badge--danger">{error}</p>
      ) : entries === null ? (
        <p className={styles.note}>Loading requests…</p>
      ) : entries.length === 0 ? (
        <p className={styles.note}>No request on file</p>
      ) : (
        <div className={styles.list}>
          {!entries.some((entry) => entry.role === 'request') && <p className={styles.note}>No request on file</p>}
          {entries.map((entry) => (
            <RequestEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </Card>
  );
}
