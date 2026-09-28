'use client';

import { useState } from 'react';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import {
  isManual,
  isSenderNotVerified,
  linkRouteRequest,
  openRouteRequestFile,
  recordManualRequest,
  requesterLabel,
  type LinkableRoute,
  type RouteRequestRecord,
  type RouteRequestRole,
} from '@/lib/routeRequests';
import styles from './RouteRequests.module.css';

/**
 * The pieces administrators see a Route Request record through (#358, #359,
 * ADR 0008), shared by the Request inbox and a Route's Requests section.
 */

export const ROLE_LABELS: Record<RouteRequestRole, string> = { request: 'Route Request', amendment: 'Route Amendment' };

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
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

/** The record's title: an email's subject, else what it is. */
export function recordTitle(record: RouteRequestRecord): string {
  if (record.source === 'manual') return record.role ? `${ROLE_LABELS[record.role]} (recorded by hand)` : 'Recorded by hand';
  return record.subject || '(no subject)';
}

export function RouteRequestBadges({ record, extra }: { record: RouteRequestRecord; extra?: React.ReactNode }) {
  return (
    <span className={styles.badges}>
      {record.status === 'dismissed' && <Badge size="sm">Dismissed</Badge>}
      {isManual(record) && <Badge tone="brand" size="sm">Manual</Badge>}
      {isSenderNotVerified(record) && <Badge tone="danger" size="sm">Sender not verified</Badge>}
      {record.loggedByStaff && <Badge tone="info" size="sm">Logged by staff</Badge>}
      {extra}
    </span>
  );
}

/** Everything captured or entered for one record, with its files to download. */
export function RouteRequestView({ record }: { record: RouteRequestRecord }) {
  const [error, setError] = useState<string | null>(null);
  const attachments = record.attachments ?? [];
  const isEmail = record.source !== 'manual';

  async function open(file: number | 'raw') {
    setError(null);
    try {
      download(await openRouteRequestFile(record.id, file));
    } catch (err) {
      console.error('Opening the file failed:', err);
      setError('Could not open the file.');
    }
  }

  return (
    <div className={styles.view}>
      {error && <p className="nd-badge nd-badge--danger">{error}</p>}
      <p className={styles.note}>
        {isEmail ? 'From' : 'Requested by'} {requesterLabel(record)} · {isEmail ? 'sent' : 'requested'} {formatWhen(record.sentAt)}
        {isEmail ? ` · received ${formatWhen(record.receivedAt)}` : ` · recorded ${formatWhen(record.receivedAt)}`}
      </p>
      {record.loggedByStaff && (
        <p className={styles.note}>
          Sent in by staff from {record.fromName ? `${record.fromName} <${record.fromAddress}>` : record.fromAddress}. Only
          administrators see this.
        </p>
      )}
      {isSenderNotVerified(record) && (
        <p className={styles.note}>
          The sender&apos;s mail server failed a check that it may send for this address, so this email may not be from who it says.
        </p>
      )}
      {record.unlinkedNote && <p className={styles.note}>{record.unlinkedNote}</p>}

      {isEmail ? (
        <pre className={styles.body}>{record.bodyText || '(no text)'}</pre>
      ) : (
        record.note && <pre className={styles.body}>{record.note}</pre>
      )}

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
      {isEmail && record.rawMessageKey && (
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => void open('raw')}>
            Download original email
          </Button>
        </div>
      )}
    </div>
  );
}

function RoleChoice({
  name,
  role,
  requestAllowed,
  onChange,
}: {
  name: string;
  role: RouteRequestRole;
  requestAllowed: boolean;
  onChange: (role: RouteRequestRole) => void;
}) {
  return (
    <fieldset className={styles.roles}>
      {(['request', 'amendment'] as const).map((option) => (
        <label key={option}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={role === option}
            disabled={option === 'request' && !requestAllowed}
            onChange={() => onChange(option)}
          />
          {ROLE_LABELS[option]}
        </label>
      ))}
    </fieldset>
  );
}

/** The requester's name and, optionally, email, entered by hand. */
export function RequesterFields({
  idPrefix,
  name,
  email,
  required,
  onName,
  onEmail,
}: {
  idPrefix: string;
  name: string;
  email: string;
  required: boolean;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
}) {
  return (
    <>
      <Field
        label={required ? 'Requested by' : 'Requested by (optional)'}
        htmlFor={`${idPrefix}-requester`}
        hint={required ? 'The person at the Customer who asked for it.' : undefined}
      >
        <input id={`${idPrefix}-requester`} className="nd-input" value={name} onChange={(event) => onName(event.target.value)} />
      </Field>
      <Field label="Their email (optional)" htmlFor={`${idPrefix}-requester-email`}>
        <input
          id={`${idPrefix}-requester-email`}
          type="email"
          className="nd-input"
          value={email}
          onChange={(event) => onEmail(event.target.value)}
        />
      </Field>
    </>
  );
}

/**
 * Links one record to a Route. Give `routes` to pick the Route (the inbox), or
 * `records` and a fixed `routeId` to pick the record (a Route's Requests).
 */
export function LinkRouteRequestForm(
  props:
    | { mode: 'pick-route'; record: RouteRequestRecord; routes: LinkableRoute[]; onLinked: () => void }
    | { mode: 'pick-record'; records: RouteRequestRecord[]; routeId: string; routeHasRequest: boolean; onLinked: () => void }
) {
  const [routeId, setRouteId] = useState(props.mode === 'pick-record' ? props.routeId : '');
  const [recordId, setRecordId] = useState(props.mode === 'pick-route' ? props.record.id : '');
  const [role, setRole] = useState<RouteRequestRole>('amendment');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = props.mode === 'pick-route' ? props.record : props.records.find((row) => row.id === recordId);
  const route = props.mode === 'pick-route' ? props.routes.find((row) => row.id === routeId) : null;
  const requestAllowed = props.mode === 'pick-route' ? !route?.hasRouteRequest : !props.routeHasRequest;
  const needsRequester = Boolean(record?.loggedByStaff);
  const effectiveRole = role === 'request' && !requestAllowed ? 'amendment' : role;
  const idPrefix = `link-${props.mode === 'pick-route' ? props.record.id : props.routeId}`;

  async function submit() {
    if (!record || !routeId) return;
    setBusy(true);
    setError(null);
    const result = await linkRouteRequest({
      recordId: record.id,
      routeId,
      role: effectiveRole,
      requester: needsRequester ? { name: requesterName, email: requesterEmail } : undefined,
    });
    setBusy(false);
    if (result.ok) props.onLinked();
    else setError(result.error);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && <p className="nd-badge nd-badge--danger">{error}</p>}
      {props.mode === 'pick-route' ? (
        <Field label="Route" htmlFor={`${idPrefix}-route`}>
          <select id={`${idPrefix}-route`} className="nd-input" value={routeId} onChange={(event) => setRouteId(event.target.value)}>
            <option value="">Choose a Route…</option>
            {props.routes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.hasRouteRequest ? ' · has its Route Request' : ''}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Email from the inbox" htmlFor={`${idPrefix}-record`}>
          <select id={`${idPrefix}-record`} className="nd-input" value={recordId} onChange={(event) => setRecordId(event.target.value)}>
            <option value="">{props.records.length > 0 ? 'Choose an email…' : 'The inbox is empty'}</option>
            {props.records.map((option) => (
              <option key={option.id} value={option.id}>
                {recordTitle(option)} · {requesterLabel(option)} · {formatWhen(option.sentAt)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <RoleChoice name={`${idPrefix}-role`} role={effectiveRole} requestAllowed={requestAllowed} onChange={setRole} />
      {needsRequester && (
        <RequesterFields
          idPrefix={idPrefix}
          name={requesterName}
          email={requesterEmail}
          required
          onName={setRequesterName}
          onEmail={setRequesterEmail}
        />
      )}
      <div className={styles.actions}>
        <Button size="sm" type="submit" disabled={busy || !record || !routeId || (needsRequester && !requesterName.trim())}>
          Link as {ROLE_LABELS[effectiveRole]}
        </Button>
      </div>
    </form>
  );
}

/** Now, as a datetime-local input's value. */
export function localNow(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

/** Records a Route Request or Amendment on a Route by hand, for one that didn't come by email. */
export function ManualRouteRequestForm({
  routeId,
  customerId,
  routeHasRequest,
  onRecorded,
}: {
  routeId: string;
  customerId: string | null;
  routeHasRequest: boolean;
  onRecorded: () => void;
}) {
  const [role, setRole] = useState<RouteRequestRole>(routeHasRequest ? 'amendment' : 'request');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requestedAt, setRequestedAt] = useState(localNow);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveRole = role === 'request' && routeHasRequest ? 'amendment' : role;
  const idPrefix = `manual-${routeId}`;

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await recordManualRequest({
      routeId,
      role: effectiveRole,
      requesterName,
      requesterEmail,
      sentAt: new Date(requestedAt).toISOString(),
      note,
      files,
      customerId,
    });
    setBusy(false);
    if (result.ok) onRecorded();
    else setError(result.error);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && <p className="nd-badge nd-badge--danger">{error}</p>}
      <RoleChoice name={`${idPrefix}-role`} role={effectiveRole} requestAllowed={!routeHasRequest} onChange={setRole} />
      <RequesterFields
        idPrefix={idPrefix}
        name={requesterName}
        email={requesterEmail}
        required
        onName={setRequesterName}
        onEmail={setRequesterEmail}
      />
      <Field label="Requested at" htmlFor={`${idPrefix}-at`}>
        <input
          id={`${idPrefix}-at`}
          type="datetime-local"
          className="nd-input"
          value={requestedAt}
          onChange={(event) => setRequestedAt(event.target.value)}
        />
      </Field>
      <Field label="Note (optional)" htmlFor={`${idPrefix}-note`} hint="e.g. what was asked for on the phone">
        <textarea id={`${idPrefix}-note`} className="nd-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Field label="Files (optional)" htmlFor={`${idPrefix}-files`}>
        <input id={`${idPrefix}-files`} type="file" multiple onChange={(event) => setFiles([...(event.target.files ?? [])])} />
      </Field>
      <div className={styles.actions}>
        <Button size="sm" type="submit" disabled={busy || !requesterName.trim() || !requestedAt}>
          Record {ROLE_LABELS[effectiveRole]}
        </Button>
      </div>
    </form>
  );
}
