'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Rows stored part way through a read are not a reading yet; reading carries on from them.
  const unfinished = Boolean(record.scheduleReading?.progress);
  const [reading, setReading] = useState<ScheduleReading | null>(unfinished ? null : (record.scheduleReading ?? null));
  const [isReading, setIsReading] = useState(false);
  const [progress, setProgress] = useState<{ pagesRead: number; pageCount: number } | null>(record.scheduleReading?.progress ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onReading?.(reading);
  }, [reading, onReading]);

  const read = useCallback(
    async (force: boolean) => {
      setIsReading(true);
      setError(null);
      try {
        setReading(await readSchedule(record.id, { force, onProgress: setProgress }));
        setProgress(null);
      } catch (err) {
        console.error('Reading the Schedule failed:', err);
        setError(err instanceof Error ? err.message : 'Could not read the Schedule.');
      } finally {
        setIsReading(false);
      }
    },
    [record.id]
  );

  // A reload part way through a read picks the same read up from its stored pages.
  const resumed = useRef(false);
  useEffect(() => {
    if (!unfinished || resumed.current) return;
    resumed.current = true;
    void read(false);
  }, [unfinished, read]);

  // An Amendment can be a sentence with no Schedule; the email alone is read.
  const isAmendment = record.role === 'amendment';
  if (!reading && !unfinished && !isAmendment && scheduleAttachmentIndex(record.attachments) === null) return null;

  const rows = (reading?.rows ?? []).filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <section className={styles.panel} aria-label="Schedule reading">
      <div className={styles.header}>
        <strong>Schedule reading</strong>
        <Button size="sm" variant="secondary" loading={isReading} onClick={() => void read(reading !== null)}>
          {reading ? 'Read again' : isAmendment ? 'Read Amendment' : 'Read Schedule'}
        </Button>
      </div>
      <p className={styles.hint}>
        {isAmendment
          ? 'A proposal read from this Route Amendment. It changes nothing on the Route; check it against the email.'
          : 'A proposal read from the attached Schedule. It changes nothing on the Route; check it against the file.'}
      </p>

      {isReading && progress && (
        <p className={styles.hint} role="status">Read {progress.pagesRead} of {progress.pageCount} pages…</p>
      )}

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
                    {row.change && <Badge size="sm" tone={row.change === 'drop' ? 'warning' : 'success'}>{row.change === 'drop' ? 'Drop' : 'Add'}</Badge>}
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
