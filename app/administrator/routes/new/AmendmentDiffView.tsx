'use client';

import { useMemo } from 'react';
import { Badge } from '@/app/components/ui/core/Badge';
import { amendmentDiff, type AmendmentRow } from '@/lib/amendmentDiff';
import type { DiffStop } from '@/lib/scheduleDiff';
import styles from './ScheduleReadingPanel.module.css';

/**
 * What a Route Amendment's reading says against the Route's Stops as they are
 * now (ADR 0014): what it adds, what it asks to take off, and what to check by
 * hand. Read-only: nothing here changes the Route.
 */
export function AmendmentDiffView({ rows, stops }: { rows: AmendmentRow[]; stops: DiffStop[] }) {
  const diff = useMemo(() => amendmentDiff(rows, stops), [rows, stops]);
  const nothing =
    diff.adds.length + diff.drops.length + diff.alreadyOn.length + diff.notOnRoute.length + diff.ambiguous.length + diff.notOnSchedule.length === 0;

  return (
    <div aria-label="Amendment changes">
      {nothing && <p className={styles.summary}>Nothing in this Amendment to add to or take off the Route.</p>}

      {diff.adds.length > 0 && (
        <>
          <p className={styles.summary}>To add ({diff.adds.length}):</p>
          <ul className={styles.instructions}>
            {diff.adds.map(({ row, inferredSuburb }, index) => (
              <li key={`${row.address}-${index}`}>
                <Badge size="sm" tone="success">Add</Badge> {row.address}
                {inferredSuburb && <span className={styles.hint}> (suburb taken from the Route&apos;s other Stops on this street)</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {diff.drops.length > 0 && (
        <>
          <p className={styles.summary}>To take off ({diff.drops.length}):</p>
          <ul className={styles.instructions}>
            {diff.drops.map(({ row, stop }, index) => (
              <li key={`${row.address}-${index}`}>
                <Badge size="sm" tone="warning">Drop</Badge> {stop.address}
              </li>
            ))}
          </ul>
        </>
      )}

      {diff.alreadyOn.length > 0 && (
        <>
          <p className={styles.summary}>Already on the Route:</p>
          <ul className={styles.instructions}>
            {diff.alreadyOn.map(({ row, stop, unitDiffers }, index) => (
              <li key={`${row.address}-${index}`}>
                {row.address} is {unitDiffers ? 'at the same building as' : ''} {stop.address}
              </li>
            ))}
          </ul>
        </>
      )}

      {diff.notOnRoute.length > 0 && (
        <>
          <p className={styles.summary}>Asked to take off, but not on the Route:</p>
          <ul className={styles.instructions}>
            {diff.notOnRoute.map((row, index) => (
              <li key={`${row.address}-${index}`}>{row.address}</li>
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
