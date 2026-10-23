'use client';

import { useMemo } from 'react';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { amendmentDiff, type AmendmentRow } from '@/lib/amendmentDiff';
import { decisionFor, type StoredDecision } from '@/lib/amendmentLines';
import type { DiffStop } from '@/lib/scheduleDiff';
import styles from './ScheduleReadingPanel.module.css';

/**
 * What a Route Amendment's reading says against the Route's Stops as they are
 * now (ADR 0014): what it adds, what it asks to take off, and what to check by
 * hand. Read-only: nothing here changes the Route.
 */
/** One line being decided: an add (with the address the Diff completed) or a drop (with the Stop it takes off). */
export type AmendmentViewLine = { change: 'add'; row: AmendmentRow; address: string } | { change: 'drop'; row: AmendmentRow; stop: DiffStop };

export function AmendmentDiffView({
  rows,
  stops,
  decisions,
  canAccept = false,
  busy,
  onAccept,
  onReject,
  loadMessage,
}: {
  rows: AmendmentRow[];
  stops: DiffStop[];
  decisions?: ReadonlyArray<StoredDecision | null | undefined> | null;
  /** False once Load has started: lines are shown but cannot be accepted. */
  canAccept?: boolean;
  /** Keys (`add:<address>`) of lines being decided. */
  busy?: ReadonlySet<string>;
  onAccept?: (line: AmendmentViewLine) => void;
  onReject?: (line: AmendmentViewLine) => void;
  loadMessage?: string;
}) {
  const diff = useMemo(() => amendmentDiff(rows, stops), [rows, stops]);
  const nothing =
    diff.adds.length + diff.drops.length + diff.alreadyOn.length + diff.notOnRoute.length + diff.ambiguous.length + diff.notOnSchedule.length === 0;

  return (
    <div aria-label="Amendment changes">
      {!canAccept && loadMessage && (diff.adds.length > 0 || diff.drops.length > 0) && <p className={styles.hint}>{loadMessage}</p>}
      {nothing && <p className={styles.summary}>Nothing in this Amendment to add to or take off the Route.</p>}

      {diff.adds.length > 0 && (
        <>
          <p className={styles.summary}>To add ({diff.adds.length}):</p>
          <ul className={styles.instructions}>
            {diff.adds.map(({ row, address, inferredSuburb }, index) => {
              const decision = decisionFor(decisions, 'add', row.address);
              const rejected = decision?.decision === 'rejected';
              const working = busy?.has(`add:${row.address}`) ?? false;
              return (
                <li key={`${row.address}-${index}`}>
                  <Badge size="sm" tone="success">Add</Badge> {row.address}
                  {inferredSuburb && <span className={styles.hint}> (suburb taken from the Route&apos;s other Stops on this street)</span>}
                  {rejected && <> <Badge size="sm" tone="neutral">Rejected</Badge></>}
                  {onAccept && (
                    <>
                      {' '}
                      <Button size="sm" disabled={!canAccept || working} loading={working} onClick={() => onAccept({ change: 'add', row, address })}>
                        Accept
                      </Button>
                      {!rejected && (
                        <>
                          {' '}
                          <Button size="sm" variant="secondary" disabled={working} onClick={() => onReject?.({ change: 'add', row, address })}>
                            Reject
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {diff.drops.length > 0 && (
        <>
          <p className={styles.summary}>To take off ({diff.drops.length}):</p>
          <ul className={styles.instructions}>
            {diff.drops.map(({ row, stop }, index) => {
              const rejected = decisionFor(decisions, 'drop', row.address)?.decision === 'rejected';
              const working = busy?.has(`drop:${row.address}`) ?? false;
              return (
                <li key={`${row.address}-${index}`}>
                  <Badge size="sm" tone="warning">Drop</Badge> {stop.address}
                  {rejected && <> <Badge size="sm" tone="neutral">Rejected</Badge></>}
                  {onAccept && (
                    <>
                      {' '}
                      <Button size="sm" disabled={!canAccept || working} loading={working} onClick={() => onAccept({ change: 'drop', row, stop })}>
                        Accept
                      </Button>
                      {!rejected && (
                        <>
                          {' '}
                          <Button size="sm" variant="secondary" disabled={working} onClick={() => onReject?.({ change: 'drop', row, stop })}>
                            Reject
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {diff.alreadyOn.length > 0 && (
        <>
          <p className={styles.summary}>Already on the Route:</p>
          <ul className={styles.instructions}>
            {diff.alreadyOn.map(({ row, stop, unitDiffers }, index) => {
              const accepted = decisionFor(decisions, 'add', row.address)?.decision === 'accepted';
              return (
                <li key={`${row.address}-${index}`}>
                  {accepted && <><Badge size="sm" tone="success">Accepted</Badge>{' '}</>}
                  {row.address} is {unitDiffers ? 'at the same building as' : ''} {stop.address}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {diff.notOnRoute.length > 0 && (
        <>
          <p className={styles.summary}>Asked to take off, not on the Route:</p>
          <ul className={styles.instructions}>
            {diff.notOnRoute.map((row, index) => (
              <li key={`${row.address}-${index}`}>
                {row.address}
                {decisionFor(decisions, 'drop', row.address)?.decision === 'accepted' && <> <Badge size="sm" tone="success">Taken off</Badge></>}
              </li>
            ))}
          </ul>
        </>
      )}

      {diff.ambiguous.length > 0 && (
        <>
          <p className={styles.summary}>Check by hand:</p>
          <ul className={styles.warnings}>
            {diff.ambiguous.map(({ row, reason }, index) => (
              <li key={`${row.address}-${index}`}>
                {row.address}: {reason}
              </li>
            ))}
          </ul>
        </>
      )}

      {diff.notOnSchedule.length > 0 && (
        <>
          <p className={styles.summary}>Not on the revised Schedule (left on the Route):</p>
          <ul className={styles.instructions}>
            {diff.notOnSchedule.map((stop, index) => (
              <li key={`${stop.address}-${index}`}>{stop.address}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
