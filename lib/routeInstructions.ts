/**
 * Route.customerInstructions started as a single free-text field (still is, in the
 * schema) that a customer user could overwrite from the route detail page — see
 * updateRouteCustomerInstructions. This module upgrades it into an append-only feed
 * of attributed entries (who posted it, which on-account agent they posted as, when)
 * without any schema or authorization change: the whole feed is still just one JSON
 * string stored in that same field, the same way stop.notes already packs structured
 * data (done/skipped markers) into a single string elsewhere in this codebase.
 *
 * Backward compatible: a route saved before this change has a plain-text
 * customerInstructions value, which parses as a single legacy entry with no
 * agentLabel/authorSub and an empty createdAt.
 */

export interface RouteInstructionEntry {
  text: string;
  agentLabel?: string;
  authorSub?: string;
  createdAt: string;
}

interface RouteInstructionsPayload {
  v: number;
  entries: RouteInstructionEntry[];
}

const FORMAT_VERSION = 1;
const MAX_ENTRY_TEXT_LENGTH = 1000;

export function parseRouteInstructions(raw: string | null | undefined): RouteInstructionEntry[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as RouteInstructionsPayload).entries)
    ) {
      return (parsed as RouteInstructionsPayload).entries.filter(
        (entry): entry is RouteInstructionEntry => Boolean(entry) && typeof entry.text === 'string' && entry.text.trim().length > 0
      );
    }
  } catch {
    // Not JSON — a legacy plain-text value from before this feature existed.
  }

  return [{ text: trimmed, createdAt: '' }];
}

export function appendRouteInstruction(
  raw: string | null | undefined,
  entry: { text: string; agentLabel?: string; authorSub?: string; createdAt?: string }
): string {
  const text = entry.text.trim().slice(0, MAX_ENTRY_TEXT_LENGTH);
  const existing = parseRouteInstructions(raw);
  const next: RouteInstructionEntry = {
    text,
    agentLabel: entry.agentLabel?.trim() || undefined,
    authorSub: entry.authorSub,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };

  const payload: RouteInstructionsPayload = { v: FORMAT_VERSION, entries: [...existing, next] };
  return JSON.stringify(payload);
}

/** Newest-first, for feed display. */
export function sortRouteInstructionsNewestFirst(entries: RouteInstructionEntry[]): RouteInstructionEntry[] {
  return [...entries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
