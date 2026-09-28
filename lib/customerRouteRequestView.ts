/**
 * What a Customer User may see of a Route's Route Request and Route Amendments
 * (#360, ADR 0008): who asked, when, what they said and the files they sent.
 * Never the SPF/DKIM/DMARC verdicts, the Sender-not-verified flag, the raw
 * message, the staff member who forwarded a Logged-by-staff email, or records
 * that are dismissed or not linked. Free of `@/` imports so API routes and the
 * browser share one definition.
 */

export type CustomerRouteRequestRole = 'request' | 'amendment';

export interface CustomerRouteRequestAttachment {
  /** Its position among the record's attachments, which the download route takes. */
  index: number;
  filename: string;
  contentType: string | null;
  size: number | null;
}

export interface CustomerRouteRequest {
  id: string;
  role: CustomerRouteRequestRole;
  requesterName: string | null;
  requesterEmail: string | null;
  /** Entered by hand rather than read from the requester's own email; shown in place of an email address. */
  recordedByNullDevice: boolean;
  sentAt: string;
  subject: string | null;
  bodyText: string | null;
  attachments: CustomerRouteRequestAttachment[];
}

interface StoredAttachment {
  key: string;
  filename: string;
  contentType?: string | null;
  size?: number | null;
  inline?: boolean | null;
}

/** The fields of a stored record this module reads. */
export interface StoredRouteRequest {
  id: string;
  source?: string | null;
  status?: string | null;
  role?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  loggedByStaff?: boolean | null;
  sentAt: string;
  subject?: string | null;
  bodyText?: string | null;
  attachments?: (StoredAttachment | null)[] | null;
}

const SIGNATURE_IMAGE_BYTES = 50 * 1024;

/** Inline images under 50 KB are signature logos, not something anyone sent on purpose. One of unknown size is kept. */
function isHidden(attachment: StoredAttachment): boolean {
  return (
    Boolean(attachment.inline) &&
    /^image\//i.test(attachment.contentType ?? '') &&
    typeof attachment.size === 'number' &&
    attachment.size < SIGNATURE_IMAGE_BYTES
  );
}

/** An attachment of a linked record the customer can see and download, or null. */
export function customerAttachment(record: StoredRouteRequest, index: number): StoredAttachment | null {
  if (record.status !== 'linked') return null;
  const attachment = record.attachments?.[index];
  return attachment && !isHidden(attachment) ? attachment : null;
}

function toCustomerRouteRequest(record: StoredRouteRequest): CustomerRouteRequest {
  // Entered by hand, or forwarded by staff: the sender isn't the requester, so only the
  // name entered by hand is shown. Stricter than the administrators' isManual, which counts
  // a Logged-by-staff email as manual only once a requester is entered: a customer never
  // sees the staff member who forwarded it (ADR 0008).
  const recordedByNullDevice = record.source === 'manual' || Boolean(record.loggedByStaff);
  return {
    id: record.id,
    role: record.role === 'request' ? 'request' : 'amendment',
    requesterName: (recordedByNullDevice ? record.requesterName : record.fromName) ?? null,
    requesterEmail: recordedByNullDevice ? null : (record.fromAddress ?? null),
    recordedByNullDevice,
    sentAt: record.sentAt,
    subject: record.subject ?? null,
    bodyText: record.bodyText ?? null,
    attachments: (record.attachments ?? []).flatMap((attachment, index) =>
      attachment && !isHidden(attachment)
        ? [{ index, filename: attachment.filename, contentType: attachment.contentType ?? null, size: attachment.size ?? null }]
        : []
    ),
  };
}

/** A Route's linked records as the customer sees them: the Route Request first, then Amendments in the order sent. */
export function toCustomerRouteRequests(records: StoredRouteRequest[]): CustomerRouteRequest[] {
  return records
    .filter((record) => record.status === 'linked')
    .map(toCustomerRouteRequest)
    .sort((a, b) => (a.role === b.role ? a.sentAt.localeCompare(b.sentAt) : a.role === 'request' ? -1 : 1));
}

/** "Requested by <name> on <date>, N amendments", or null when the Route has no Route Request. */
export function customerRouteRequestSummary(entries: CustomerRouteRequest[], formatDate: (iso: string) => string): string | null {
  const routeRequest = entries.find((entry) => entry.role === 'request');
  if (!routeRequest) return null;
  const amendments = entries.filter((entry) => entry.role === 'amendment').length;
  const by = routeRequest.requesterName || routeRequest.requesterEmail;
  return `Requested${by ? ` by ${by}` : ''} on ${formatDate(routeRequest.sentAt)}, ${amendments} ${amendments === 1 ? 'amendment' : 'amendments'}`;
}
