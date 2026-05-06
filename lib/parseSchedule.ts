/**
 * parseSchedule.ts
 *
 * Parses the customer schedule table (copied as plain text from Excel/PDF) into
 * a list of draft stops ready for route creation.
 *
 * Expected format (columns separated by 2+ spaces or tabs):
 *   TIME          KEY   PROPERTY                          WED
 *   9:15 - 9:45
 *                 5     1/25 Bridge Street, Epping        BO
 *                 5     12 Warrawong Street, Eastwood      BO
 *   12:00         Auction - 5 Kent Street, Epping
 *
 * The parser is intentionally lenient — it ignores unknown rows and deduplicates
 * by normalised address so re-pasting the same data is safe.
 */

export interface ParsedStop {
  address: string;
  numberOfSigns: number;
  agent: string;
  isAuction: boolean;
  timeSlot: string;
}

export interface ParseScheduleResult {
  stops: ParsedStop[];
  /** Lines that could not be parsed (for user review) */
  unparsedLines: string[];
  /** Addresses that appeared more than once and were de-duplicated */
  duplicatesRemoved: string[];
}

// Lines to skip entirely
const SKIP_PATTERNS = [
  /^allocation\s+of/i,
  /^time\s+key/i,
  /^\s*time\s*$/i,
  /^(betty|david|kate|total|staff)\s/i,
  /^\s*$/,
];

// A time slot header: optional leading digit(s):digit(s) - digit(s):digit(s)
const TIME_SLOT_RE = /^(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}|\d{1,2}:\d{2})\s*/;

// An auction-only line (no signs/agent) — standalone notice row
const AUCTION_NOTICE_RE = /^auction\s*[-–]\s*(.+)/i;

// A stop data row: {signs}  {address}  {agentCode}
// The agent code is 2-3 uppercase letters at the end, separated by whitespace
const STOP_ROW_RE = /^(\d+)\s{1,}(.+?)\s{2,}([A-Z]{2,3})\s*$/;

// "NEW - " or "NEW: " prefix on address
const NEW_PREFIX_RE = /^NEW\s*[-–:]\s*/i;

// Normalise an address for deduplication comparison
function normalise(address: string): string {
  return address.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseScheduleText(raw: string): ParseScheduleResult {
  const lines = raw.split(/\r?\n/);
  const stops: ParsedStop[] = [];
  const unparsedLines: string[] = [];
  const duplicatesRemoved: string[] = [];
  const seen = new Set<string>();
  let currentSlot = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip blank / header / summary lines
    if (SKIP_PATTERNS.some((p) => p.test(line))) continue;

    // Extract and strip a leading time slot if present
    const timeMatch = line.match(TIME_SLOT_RE);
    let remainder = line;
    if (timeMatch) {
      currentSlot = timeMatch[1].replace(/\s+/g, ' ').trim();
      remainder = line.slice(timeMatch[0].length).trim();
    }

    if (!remainder) continue; // time-only line, nothing else to parse

    // Auction notice row (no signs/agent columns) — skip as a stop, it is captured
    // via isAuction on the matching property stop
    if (AUCTION_NOTICE_RE.test(remainder)) continue;

    // Try to match a stop row: {signs}  {address}  {agent}
    const stopMatch = remainder.match(STOP_ROW_RE);
    if (stopMatch) {
      const [, signsStr, rawAddress, agent] = stopMatch;
      const isAuction = /auction/i.test(rawAddress);
      const address = rawAddress
        .replace(NEW_PREFIX_RE, '')
        .replace(/^auction\s*[-–]\s*/i, '')
        .trim();

      const key = normalise(address);
      if (seen.has(key)) {
        duplicatesRemoved.push(address);
        continue;
      }
      seen.add(key);

      stops.push({
        address,
        numberOfSigns: Number(signsStr),
        agent: agent.trim(),
        isAuction,
        timeSlot: currentSlot,
      });
      continue;
    }

    // Couldn't parse — record for user review
    unparsedLines.push(line);
  }

  return { stops, unparsedLines, duplicatesRemoved };
}
