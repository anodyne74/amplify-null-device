/**
 * Capturing an email sent to requests@ as a Route Request record (#358, ADR
 * 0008). Runs in the route-request-capture function, which SES invokes for
 * every message its receipt rule accepts -- the same rule that invokes the
 * forwarder, as a separate action, so neither can stop the other.
 *
 * Kept free of `@/` imports: the capture Lambda imports it by relative path.
 */
import { listAll } from './listAll';
import { parseRequestEmail, requestAttachmentKey, suggestCustomer, type RequestEmailFields } from './routeRequestEmail';

/** The part of an SES receipt event record the capture reads. */
export interface SesReceiptRecord {
  ses: {
    mail: { messageId: string; timestamp: string };
    receipt: {
      recipients: string[];
      spfVerdict?: { status?: string };
      dkimVerdict?: { status?: string };
      dmarcVerdict?: { status?: string };
    };
  };
}

/** What an Amplify Data model call resolves to. */
type ModelResponse = { data?: unknown; errors?: readonly unknown[] | null };

type StoredAttachment = { key: string; filename: string; contentType: string; size: number; inline: boolean };

type CaptureClient = {
  models: {
    RouteRequestEmail: {
      get: (input: { id: string }) => Promise<ModelResponse>;
      create: (
        input: RequestEmailFields & {
          id: string;
          attachments: StoredAttachment[];
          suggestedCustomerId: string | null;
          status: 'unlinked';
        }
      ) => Promise<ModelResponse>;
    };
    CustomerUser: object;
  };
};

export interface CaptureDeps {
  /** The branch's email domain -- requests@ lives there, and staff send from it. */
  ownDomain: string;
  readRawMessage: (key: string) => Promise<Uint8Array>;
  putFile: (key: string, content: Uint8Array, contentType: string) => Promise<void>;
  client: CaptureClient;
}

export type CaptureOutcome = 'captured' | 'already-captured' | 'not-a-request';

/**
 * Captures one received message if it was addressed to requests@: copies its
 * attachments to requests/<message ID>/ and creates the Unlinked record, with
 * the SES message ID as its id. A message already captured is left alone, so
 * SES or Lambda retrying the delivery makes no duplicate. Throws if a file or
 * the record can't be written, so Lambda retries it.
 */
export async function captureRouteRequest(record: SesReceiptRecord, deps: CaptureDeps): Promise<CaptureOutcome> {
  const { mail, receipt } = record.ses;
  const requestsAddress = `requests@${deps.ownDomain}`.toLowerCase();
  if (!receipt.recipients.some((recipient) => recipient.toLowerCase() === requestsAddress)) return 'not-a-request';

  const models = deps.client.models;
  const existing = await models.RouteRequestEmail.get({ id: mail.messageId });
  if (existing.data) return 'already-captured';

  const raw = await deps.readRawMessage(mail.messageId);
  const { record: fields, attachments } = await parseRequestEmail(
    raw,
    {
      messageId: mail.messageId,
      timestamp: mail.timestamp,
      spfVerdict: receipt.spfVerdict?.status ?? null,
      dkimVerdict: receipt.dkimVerdict?.status ?? null,
      dmarcVerdict: receipt.dmarcVerdict?.status ?? null,
    },
    deps.ownDomain
  );

  const stored: StoredAttachment[] = [];
  for (const [index, { content, ...file }] of attachments.entries()) {
    const key = requestAttachmentKey(mail.messageId, index, file.filename);
    await deps.putFile(key, content, file.contentType);
    stored.push({ key, ...file });
  }

  // Only a suggestion, so a failed lookup costs the suggestion, not the capture.
  const customerUsers = await listAll(deps.client, 'CustomerUser');
  if (customerUsers.errors.length > 0) {
    console.error('Could not list Customer Users to suggest a Customer:', customerUsers.errors);
  }

  const { errors } = await models.RouteRequestEmail.create({
    id: mail.messageId,
    ...fields,
    attachments: stored,
    suggestedCustomerId: customerUsers.errors.length > 0 ? null : suggestCustomer(fields.fromAddress, customerUsers.data),
    status: 'unlinked',
  });
  if (errors?.length) throw new Error(`Could not create the Route Request record: ${JSON.stringify(errors)}`);
  return 'captured';
}
