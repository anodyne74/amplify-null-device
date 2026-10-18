'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { totalsWarnings } from '@/lib/scheduleTotals';
import { readSchedule, scheduleAttachmentIndex, type RouteRequestRecord, type ScheduleReading } from '@/lib/routeRequests';
import styles from './ScheduleReadingPanel.module.css';

/**
 * What the Schedule on a Route Request says (ADR 0014), read by the server and
 * listed here as a proposal. Read-only: nothing here changes the Route being
 * made. A reading already stored on the record shows straight away.
 */
export function ScheduleReadingPanel({
  record,
  onReading,
}: {
  record: RouteRequestRecord;
  /** Told the reading now showing (null for none), so the page can compare it with the copied Stops. */
  onReading?: (reading: ScheduleReading | null) => void;
}) {
  const [reading, setReading] = useState<ScheduleReading | null>(record.scheduleReading ?? null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onReading?.(reading);
  }, [reading, onReading]);

  if (!reading && scheduleAttachmentIndex(record.attachments) === null) return null;

  const read = async (force: boolean) => {
    setIsReading(true);
    setError(null);
    try {
      setReading(await readSchedule(record.id, { force }));
    } catch (err) {
      console.error('Reading the Schedule failed:', err);
      setError(err instanceof Error ? err.message : 'Could not read the Schedule.');
    } finally {
      setIsReading(false);
    }
  };

  const rows = (reading?.rows ?? []).filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <section className={styles.panel} aria-label="Schedule reading">
      <div className={styles.header}>
        <strong>Schedule reading</strong>
        <Button size="sm" variant="secondary" loading={isReading} onClick={() => void read(reading !== null)}>
          {reading ? 'Read again' : 'Read Schedule'}
        </Button>
      </div>
      <p className={styles.hint}>
        A proposal read from the attached Schedule. It changes nothing on the Route; check it against the file.
      </p>

      {error && <div className={styles.error} role="alert">{error}</div>}

      {reading && (
        <>
          <p className={styles.summary}>
            {reading.sheetDate ? `Sheet dated ${reading.sheetDate}. ` : ''}
            {rows.length} {rows.length === 1 ? 'property' : 'properties'}.
          </p>
          {[...totalsWarnings(reading), ...(reading.warnings ?? [])].length > 0 && (
            <ul className={styles.warnings}>
              {[...totalsWarnings(reading), ...(reading.warnings ?? [])].map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          {(reading.instructions ?? []).length > 0 && (
            <>
              <p className={styles.summary}>
                {(reading.instructions ?? []).length} {(reading.instructions ?? []).length === 1 ? 'instruction' : 'instructions'} found:
              </p>
              <ul className={styles.instructions}>
                {(reading.instructions ?? []).map((item, index) =>
                  item ? (
                    <li key={`${item.text}-${index}`}>
                      {item.address ? `${item.address}: ` : ''}{item.text}
                    </li>
                  ) : null
                )}
              </ul>
            </>
          )}
          <table className={styles.table}>
            <thead>
              <tr><th>Address</th><th>Signs</th><th>Agent</th><th>Time</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.address}-${index}`}>
                  <td>{row.address}</td>
                  <td>{row.numberOfSigns ?? ''}</td>
                  <td>{row.agent ?? ''}</td>
                  <td>{row.timeSlot ?? ''}</td>
                  <td className={styles.flags}>
                    {row.isAuction && <Badge size="sm" tone="warning">Auction</Badge>}
                    {row.isPreview && <Badge size="sm" tone="info">Preview</Badge>}
                    {row.isNew && <Badge size="sm" tone="brand">New</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
