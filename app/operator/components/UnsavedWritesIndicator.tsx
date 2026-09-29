'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/app/components/ui/core/Button';
import { Dialog } from '@/app/components/ui/feedback/Dialog';
import { signRunOutbox, useSignRunOutbox, type OutboxEntry } from '@/lib/signRunOutbox';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import type { SignRunTimingKind } from '@/lib/signRunTiming';
import styles from './UnsavedWritesIndicator.module.css';

const ACTION_LABEL: Record<SignRunTimingKind, string> = {
  startLoad: 'Start load',
  confirmLoad: 'Confirm load',
  startPlacement: 'Start placement',
  completePlacement: 'Complete placement',
  startPickup: 'Start pickup',
  completePickup: 'Complete pickup',
  startUnload: 'Start unload',
  confirmUnload: 'Confirm unload',
  finalise: 'Complete route',
  placementStopDone: 'Stop placed',
  placementStopSkipped: 'Stop skipped',
  pickupStopDone: 'Stop picked up',
  pickupStopSkipped: 'Stop skipped',
};

/** "1 action" / "3 actions". */
export function countActions(count: number) {
  return `${count} ${count === 1 ? 'action' : 'actions'}`;
}

/** The logout warning while writes are unsaved, else null. */
export function unsavedLogoutWarning(count: number): string | null {
  if (count === 0) return null;
  return `${countActions(count)} ${count === 1 ? "isn't" : "aren't"} saved yet. Stay signed in until they are?`;
}

function formatTime(epochMs: number) {
  return new Date(epochMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function groupByRoute(entries: readonly OutboxEntry[]) {
  const groups = new Map<string, OutboxEntry[]>();
  for (const entry of entries) {
    groups.set(entry.routeId, [...(groups.get(entry.routeId) ?? []), entry]);
  }
  return [...groups.entries()];
}

/** Looks up route codes only while the list is open. */
function UnsavedWritesList({ entries }: { entries: readonly OutboxEntry[] }) {
  const { routes } = useLiveAllRoutes();
  const routeCodes = useMemo(() => new Map(routes.map((route) => [route.id, route.routeCode])), [routes]);
  const held = entries.some((entry) => entry.state === 'held');

  return (
    <div className={styles.list}>
      {held && (
        <div className={styles.group}>
          <p className={styles.note}>These actions from earlier weren&apos;t saved. Send or discard?</p>
          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={() => signRunOutbox.discardHeld()}>
              Discard
            </Button>
            <Button size="sm" onClick={() => signRunOutbox.sendHeld()}>
              Send
            </Button>
          </div>
        </div>
      )}
      {groupByRoute(entries).map(([routeId, routeEntries]) => {
        const rejected = routeEntries.some((entry) => entry.state === 'rejected');
        return (
          <section key={routeId} className={styles.group} aria-label={`Route ${routeCodes.get(routeId) ?? ''}`.trim()}>
            <h3 className={styles.routeCode}>{routeCodes.get(routeId) ?? 'Route'}</h3>
            <ul className={styles.entries}>
              {routeEntries.map((entry) => (
                <li key={entry.id} className={styles.entry}>
                  <span>{ACTION_LABEL[entry.kind]}</span>
                  <span className={styles.time}>{formatTime(entry.confirmedAt)}</span>
                </li>
              ))}
            </ul>
            {rejected ? (
              <>
                <p className={styles.error}>
                  These couldn&apos;t be saved, so they&apos;ve been undone on screen.
                </p>
                <div className={styles.actions}>
                  <Button variant="secondary" size="sm" onClick={() => signRunOutbox.discardRoute(routeId)}>
                    Discard
                  </Button>
                  <Button size="sm" onClick={() => signRunOutbox.resend(routeId)}>
                    Try again
                  </Button>
                </div>
              </>
            ) : (
              !routeEntries.some((entry) => entry.state === 'held') && (
                <p className={styles.note}>Saving. This keeps trying until it gets through.</p>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The operator portal's save status (#355): hidden while every Sign Run
 * action has saved, "N unsaved" while any are waiting, and a failed state once
 * any Route's writes have been refused. Tapping it lists the unsaved actions
 * with the Try again / Discard / Send choices. Opens by itself when the app
 * starts with actions held from earlier.
 */
export function UnsavedWritesIndicator() {
  const { entries } = useSignRunOutbox();
  const [open, setOpen] = useState(false);
  const failed = entries.some((entry) => entry.state === 'rejected');
  const held = entries.some((entry) => entry.state === 'held');

  useEffect(() => {
    if (held) setOpen(true);
  }, [held]);

  useEffect(() => {
    if (entries.length === 0) setOpen(false);
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className={failed ? `${styles.pill} ${styles.pillFailed}` : styles.pill}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className={styles.dot} aria-hidden="true" />
        {failed ? 'Not saved' : `${entries.length} unsaved`}
      </button>
      <Dialog
        open={open}
        title="Unsaved actions"
        description={`${countActions(entries.length)} on this device ${entries.length === 1 ? "hasn't" : "haven't"} saved yet.`}
        onClose={() => setOpen(false)}
      >
        <UnsavedWritesList entries={entries} />
      </Dialog>
    </>
  );
}
