'use client';

import { useMemo } from 'react';
import { Badge } from '@/app/components/ui/core/Badge';
import type { ScheduleReading } from '@/lib/routeRequests';
import { scheduleDiff, type DiffStop } from '@/lib/scheduleDiff';
import styles from './ScheduleDiffPanel.module.css';

type Row = NonNullable<NonNullable<ScheduleReading['rows']>[number]>;

/**
 * The Schedule Diff (ADR 0014): what the Schedule reading says against the Stops
 * copied from the previous Route. A proposal, read-only: nothing here changes the
 * Stops, which the administrator still edits.
 */
export function ScheduleDiffPanel({ reading, stops }: { reading: ScheduleReading; stops: DiffStop[] }) {
  const diff = useMemo(
    () => scheduleDiff((reading.rows ?? []).filter((row): row is Row => Boolean(row)), stops),
    [reading, stops]
  );
  const unitChanges = diff.matched.filter(({ unitDiffers }) => unitDiffers);

  return (
    <section className={styles.panel} aria-label="Schedule Diff">
      <strong>Changes the Schedule suggests</strong>
      <p className={styles.summary}>
        {diff.adds.length} to add, {diff.drops.length} to drop, {diff.ambiguous.length} to check,{' '}
        {diff.matched.length - unitChanges.length} unchanged. Nothing is applied: edit the Stops yourself.
      </p>

      {diff.adds.length > 0 && (
        <>
          <h4 className={styles.heading}>Add</h4>
          <ul className={styles.list}>
            {diff.adds.map((row, index) => (
              <li key={`${row.address}-${index}`}>
                {row.address}
                {row.numberOfSigns != null && ` · ${row.numberOfSigns} signs`}
                {row.agent && ` · ${row.agent}`} {row.isAuction && <Badge size="sm" tone="warning">Auction</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}

      {diff.drops.length > 0 && (
        <>
          <h4 className={styles.heading}>Drop</h4>
          <ul className={styles.list}>
            {diff.drops.map((stop, index) => <li key={`${stop.address}-${index}`}>{stop.address}</li>)}
          </ul>
        </>
      )}

      {diff.ambiguous.length > 0 && (
        <>
          <h4 className={styles.heading}>Check by hand</h4>
          <ul className={styles.list}>
            {diff.ambiguous.map(({ row, reason }, index) => (
              <li key={`${row.address}-${index}`}>
                {row.address} <span className={styles.reason}>{reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {unitChanges.length > 0 && (
        <>
          <h4 className={styles.heading}>Same Property, different unit</h4>
          <ul className={styles.list}>
            {unitChanges.map(({ row, stop }, index) => (
              <li key={`${row.address}-${index}`}>
                {stop.address} <span className={styles.reason}>now {row.address}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
