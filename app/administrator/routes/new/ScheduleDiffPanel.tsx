'use client';

import { useMemo } from 'react';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import type { ScheduleReading } from '@/lib/routeRequests';
import { scheduleDiff, type DiffStop } from '@/lib/scheduleDiff';
import styles from './ScheduleDiffPanel.module.css';

type Row = NonNullable<NonNullable<ScheduleReading['rows']>[number]>;

export type DiffDecision = 'accepted' | 'rejected';

/** One Add or Drop line: `index` is its row's position in the reading (Add) or the Stop's position in the copy (Drop). */
export type DiffLine = { kind: 'add' | 'drop'; index: number };

export const lineKey = ({ kind, index }: DiffLine) => `${kind}:${index}`;

/**
 * The Schedule Diff (ADR 0014): what the Schedule reading says against the Stops
 * copied from the previous Route. Each Add and Drop can be accepted, which puts
 * it in the draft Stops, or rejected, which leaves the copy as it was; either can
 * be changed back. Nothing reaches the Route until it is created. Lines to check
 * by hand and unit changes are for the administrator to edit in the Stops.
 */
export function ScheduleDiffPanel({
  reading,
  stops,
  decisions,
  busy,
  onDecide,
}: {
  reading: ScheduleReading;
  /** The Stops as copied, not as edited since. */
  stops: DiffStop[];
  decisions: Record<string, DiffDecision>;
  /** Keys of lines being applied (an Add is found on the map first). */
  busy: ReadonlySet<string>;
  onDecide: (lines: DiffLine[], decision: DiffDecision) => void;
}) {
  const rows = useMemo(() => (reading.rows ?? []).filter((row): row is Row => Boolean(row)), [reading]);
  const diff = useMemo(() => scheduleDiff(rows, stops), [rows, stops]);
  const unitChanges = diff.matched.filter(({ unitDiffers }) => unitDiffers);

  const adds = diff.adds.map((row) => ({ row, line: { kind: 'add', index: rows.indexOf(row) } as DiffLine }));
  const drops = diff.drops.map((stop) => ({ stop, line: { kind: 'drop', index: stops.indexOf(stop) } as DiffLine }));

  const buttons = (line: DiffLine, label: string) => {
    const key = lineKey(line);
    const decision = decisions[key];
    return (
      <span className={styles.actions}>
        <Button
          size="sm"
          variant={decision === 'accepted' ? 'primary' : 'secondary'}
          aria-pressed={decision === 'accepted'}
          aria-label={`Accept: ${label}`}
          loading={busy.has(key)}
          onClick={() => onDecide([line], 'accepted')}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant={decision === 'rejected' ? 'primary' : 'secondary'}
          aria-pressed={decision === 'rejected'}
          aria-label={`Reject: ${label}`}
          disabled={busy.has(key)}
          onClick={() => onDecide([line], 'rejected')}
        >
          Reject
        </Button>
      </span>
    );
  };

  const acceptAll = (group: Array<{ line: DiffLine }>, label: string) => {
    const pending = group.filter(({ line }) => decisions[lineKey(line)] === undefined).map(({ line }) => line);
    return (
      <Button size="sm" variant="ghost" disabled={pending.length === 0} onClick={() => onDecide(pending, 'accepted')}>
        {label}
      </Button>
    );
  };

  return (
    <section className={styles.panel} aria-label="Schedule Diff">
      <strong>Changes the Schedule suggests</strong>
      <p className={styles.summary}>
        {adds.length} to add, {drops.length} to drop, {diff.ambiguous.length} to check,{' '}
        {diff.matched.length - unitChanges.length} unchanged. Accept the ones you want; nothing reaches the Route until you create it.
      </p>

      {adds.length > 0 && (
        <>
          <h4 className={styles.heading}>Add {acceptAll(adds, 'Accept all adds')}</h4>
          <ul className={styles.list}>
            {adds.map(({ row, line }) => (
              <li key={lineKey(line)} className={styles.line}>
                <span>
                  {row.address}
                  {row.numberOfSigns != null && ` · ${row.numberOfSigns} signs`}
                  {row.agent && ` · ${row.agent}`} {row.isAuction && <Badge size="sm" tone="warning">Auction</Badge>}
                </span>
                {buttons(line, `add ${row.address}`)}
              </li>
            ))}
          </ul>
        </>
      )}

      {drops.length > 0 && (
        <>
          <h4 className={styles.heading}>Drop {acceptAll(drops, 'Accept all drops')}</h4>
          <ul className={styles.list}>
            {drops.map(({ stop, line }) => (
              <li key={lineKey(line)} className={styles.line}>
                <span>{stop.address}</span>
                {buttons(line, `drop ${stop.address}`)}
              </li>
            ))}
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
