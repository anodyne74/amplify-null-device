/**
 * Sign Run timing records (#353) — one per Sign Run write, sent from the
 * operator's device to /api/sign-run-timing so the ops dashboard can show how
 * long operators wait on a save (#266, ADR 0007).
 *
 * The record shape and its validation live here, shared by the sender in
 * lib/signRunTransitions.ts and the API route that logs it.
 */
import type { SignRunTransitionType } from '@/lib/signRunTransitions';

export type StopSettlementKind =
  | 'placementStopDone'
  | 'placementStopSkipped'
  | 'pickupStopDone'
  | 'pickupStopSkipped';

export type SignRunTimingKind = SignRunTransitionType | StopSettlementKind;

// A Record, so a new transition type doesn't compile until it's listed here.
const KIND: Record<SignRunTimingKind, true> = {
  startLoad: true,
  confirmLoad: true,
  startPlacement: true,
  completePlacement: true,
  startPickup: true,
  completePickup: true,
  startUnload: true,
  confirmUnload: true,
  finalise: true,
  placementStopDone: true,
  placementStopSkipped: true,
  pickupStopDone: true,
  pickupStopSkipped: true,
};

export const SIGN_RUN_TIMING_KINDS = Object.keys(KIND) as SignRunTimingKind[];

export interface SignRunTimingRecord {
  kind: SignRunTimingKind;
  routeId: string;
  /** Time spent in the Cognito token check before the mutation. */
  authCheckMs: number;
  mutationMs: number;
  /** Time from the operator's OK to the save finishing. */
  confirmToSavedMs: number;
  /** Attempts before the last, for a write sent through the outbox (#355). */
  retries: number;
  /** 'discarded': an unsaved write the operator dropped, or signed out with (#355). */
  outcome: 'saved' | 'failed' | 'discarded';
}

const OUTCOMES: SignRunTimingRecord['outcome'][] = ['saved', 'failed', 'discarded'];

const DURATION_FIELDS = ['authCheckMs', 'mutationMs', 'confirmToSavedMs', 'retries'] as const;

// A day in ms: anything longer is a clock or client bug, not a slow save.
const MAX_DURATION = 86_400_000;

/** The record in `body`, or null when any field is missing or malformed. */
export function parseSignRunTimingRecord(body: unknown): SignRunTimingRecord | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;

  if (!SIGN_RUN_TIMING_KINDS.includes(candidate.kind as SignRunTimingKind)) return null;
  if (typeof candidate.routeId !== 'string' || !candidate.routeId.trim() || candidate.routeId.length > 128) return null;
  if (!OUTCOMES.includes(candidate.outcome as SignRunTimingRecord['outcome'])) return null;
  for (const field of DURATION_FIELDS) {
    const value = candidate[field];
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_DURATION) return null;
  }

  return {
    kind: candidate.kind as SignRunTimingKind,
    routeId: candidate.routeId.trim(),
    authCheckMs: candidate.authCheckMs as number,
    mutationMs: candidate.mutationMs as number,
    confirmToSavedMs: candidate.confirmToSavedMs as number,
    retries: candidate.retries as number,
    outcome: candidate.outcome as SignRunTimingRecord['outcome'],
  };
}
