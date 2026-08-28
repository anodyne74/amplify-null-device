'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { IconButton } from '@/app/components/ui/core/IconButton';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Switch } from '@/app/components/ui/forms/Switch';
import type { OperatorAvailabilityBlock, CustomerClosureBlock } from '@/amplify/types';
import { listOperatorAvailabilityBlocks } from '@/lib/queries/ListOperatorAvailabilityBlocks';
import { createOperatorAvailabilityBlock } from '@/lib/queries/CreateOperatorAvailabilityBlock';
import { deleteOperatorAvailabilityBlock } from '@/lib/queries/DeleteOperatorAvailabilityBlock';
import { listCustomerClosureBlocks } from '@/lib/queries/ListCustomerClosureBlocks';
import { createCustomerClosureBlock } from '@/lib/queries/CreateCustomerClosureBlock';
import { deleteCustomerClosureBlock } from '@/lib/queries/DeleteCustomerClosureBlock';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import styles from './ServiceCalendar.module.css';

export type ServiceCalendarRole = 'staff' | 'customer-admin' | 'customer-readonly';

export interface ServiceCalendarProps {
  customerId: string;
  role: ServiceCalendarRole;
  currentUserSub: string;
  viewerSubs: string[];
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatLongDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

interface CalendarCell {
  key: string;
  day: number;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  isToday: boolean;
  noDriversBlock?: OperatorAvailabilityBlock;
  closedBlock?: CustomerClosureBlock;
}

export function ServiceCalendar({ customerId, role, currentUserSub, viewerSubs }: ServiceCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [noDriversBlocks, setNoDriversBlocks] = useState<OperatorAvailabilityBlock[]>([]);
  const [closedBlocks, setClosedBlocks] = useState<CustomerClosureBlock[]>([]);
  const [routes, setRoutes] = useState<{ actualEndTime?: string | null; actualStartTime?: string | null; createdAt?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>(dateKey(today.getFullYear(), today.getMonth(), today.getDate()));
  const [reasonDraft, setReasonDraft] = useState('');
  const [applyToAllCustomers, setApplyToAllCustomers] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [noDriversResult, closedResult, routesResult] = await Promise.all([
      listOperatorAvailabilityBlocks(customerId),
      listCustomerClosureBlocks(customerId),
      listMyRoutes({ customerId, limit: 500 }),
    ]);

    if ((noDriversResult.errors && noDriversResult.errors.length > 0) || (closedResult.errors && closedResult.errors.length > 0)) {
      setLoadError('Could not load the service calendar.');
    }

    setNoDriversBlocks(noDriversResult.data as OperatorAvailabilityBlock[]);
    setClosedBlocks(closedResult.data as CustomerClosureBlock[]);
    setRoutes(routesResult.data || []);
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const noDriversByDate = useMemo(() => {
    const map = new Map<string, OperatorAvailabilityBlock>();
    for (const block of noDriversBlocks) {
      if (block.date) map.set(block.date, block);
    }
    return map;
  }, [noDriversBlocks]);

  const closedByDate = useMemo(() => {
    const map = new Map<string, CustomerClosureBlock>();
    for (const block of closedBlocks) {
      if (block.date) map.set(block.date, block);
    }
    return map;
  }, [closedBlocks]);

  const deliveriesByDate = useMemo(() => {
    // Route has no dedicated "scheduled date" field — same fallback chain as the
    // admin dashboard's aggregation (lib/aggregateRouteData.ts).
    const map = new Map<string, number>();
    for (const route of routes) {
      const isoDate = route.actualEndTime || route.actualStartTime || route.createdAt;
      if (!isoDate) continue;
      const parsed = new Date(isoDate);
      if (Number.isNaN(parsed.getTime())) continue;
      const key = dateKey(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [routes]);

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = useMemo<CalendarCell[]>(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const mondayIndex = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(viewYear, viewMonth, 1 - mondayIndex);

    return Array.from({ length: 42 }, (_, index) => {
      const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const key = dateKey(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      const weekday = cellDate.getDay();

      return {
        key,
        day: cellDate.getDate(),
        isCurrentMonth: cellDate.getMonth() === viewMonth,
        isWeekend: weekday === 0 || weekday === 6,
        isToday: key === todayKey,
        noDriversBlock: noDriversByDate.get(key),
        closedBlock: closedByDate.get(key),
      };
    });
  }, [viewYear, viewMonth, noDriversByDate, closedByDate, todayKey]);

  const upcoming = useMemo(() => {
    const items: { key: string; label: string; badge: string }[] = [];
    for (const block of noDriversBlocks) {
      if (block.date && block.date >= todayKey) {
        items.push({ key: block.date, label: block.reason || 'No drivers available', badge: 'No drivers' });
      }
    }
    for (const block of closedBlocks) {
      if (block.date && block.date >= todayKey) {
        items.push({ key: block.date, label: block.reason || 'Agency closed', badge: 'Closed' });
      }
    }
    return items.sort((a, b) => a.key.localeCompare(b.key)).slice(0, 8);
  }, [noDriversBlocks, closedBlocks, todayKey]);

  const goToDate = (key: string) => {
    const [year, month] = key.split('-').map(Number);
    setViewYear(year);
    setViewMonth(month - 1);
    setSelectedKey(key);
  };

  const selectedNoDriversBlock = noDriversByDate.get(selectedKey);
  const selectedClosedBlock = closedByDate.get(selectedKey);

  const canWriteNoDrivers = role === 'staff';
  const canWriteClosed = role === 'customer-admin';

  const handleToggleNoDrivers = async () => {
    setActionPending(true);
    setActionError(null);

    if (selectedNoDriversBlock) {
      const result = await deleteOperatorAvailabilityBlock(selectedNoDriversBlock.id);
      if (result.errors && result.errors.length > 0) {
        setActionError('Could not update the calendar.');
        setActionPending(false);
        return;
      }
      setReasonDraft('');
      await refetch();
      setActionPending(false);
      return;
    }

    if (applyToAllCustomers) {
      const customersResult = await listAllCustomers({ limit: 200 });
      if (customersResult.errors && customersResult.errors.length > 0) {
        setActionError('Could not load customers to apply the block to.');
        setActionPending(false);
        return;
      }

      const activeCustomers = (customersResult.data || []).filter((c) => c.status === 'active');
      const failures: string[] = [];

      for (const activeCustomer of activeCustomers) {
        const existing = await listOperatorAvailabilityBlocks(activeCustomer.id);
        const alreadyBlocked = (existing.data as OperatorAvailabilityBlock[]).some((block) => block.date === selectedKey);
        if (alreadyBlocked) continue;

        const created = await createOperatorAvailabilityBlock({
          customerId: activeCustomer.id,
          date: selectedKey,
          reason: reasonDraft.trim() || undefined,
          createdByOperatorId: currentUserSub,
          viewerSubs: activeCustomer.viewerSubs || [],
        });
        if (created.errors && created.errors.length > 0) failures.push(activeCustomer.name);
      }

      if (failures.length > 0) {
        setActionError(`Could not block this day for: ${failures.join(', ')}.`);
      }

      setReasonDraft('');
      await refetch();
      setActionPending(false);
      return;
    }

    const result = await createOperatorAvailabilityBlock({
      customerId,
      date: selectedKey,
      reason: reasonDraft.trim() || undefined,
      createdByOperatorId: currentUserSub,
      viewerSubs,
    });

    if (result.errors && result.errors.length > 0) {
      setActionError('Could not update the calendar.');
      setActionPending(false);
      return;
    }

    setReasonDraft('');
    await refetch();
    setActionPending(false);
  };

  const handleToggleClosed = async () => {
    setActionPending(true);
    setActionError(null);

    const result = selectedClosedBlock
      ? await deleteCustomerClosureBlock(selectedClosedBlock.id)
      : await createCustomerClosureBlock({
          customerId,
          date: selectedKey,
          reason: reasonDraft.trim() || undefined,
          createdByUserSub: currentUserSub,
          accountOwnerSub: currentUserSub,
          viewerSubs,
        });

    if (result.errors && result.errors.length > 0) {
      setActionError('Could not update the calendar.');
      setActionPending(false);
      return;
    }

    setReasonDraft('');
    await refetch();
    setActionPending(false);
  };

  return (
    <div className={styles.layout}>
      <Card padded={false}>
        <div className={styles.header}>
          <IconButton
            icon="chevron-left"
            label="Previous month"
            onClick={() => {
              const previous = new Date(viewYear, viewMonth - 1, 1);
              setViewYear(previous.getFullYear());
              setViewMonth(previous.getMonth());
            }}
          />
          <div className={styles.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</div>
          <IconButton
            icon="chevron-right"
            label="Next month"
            onClick={() => {
              const next = new Date(viewYear, viewMonth + 1, 1);
              setViewYear(next.getFullYear());
              setViewMonth(next.getMonth());
            }}
          />
        </div>

        <div className={styles.grid}>
          {loadError && <p className={styles.loadError}>{loadError}</p>}

          <div className={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className={styles.weekdayLabel}>{label}</div>
            ))}
          </div>

          <div className={styles.cellsGrid}>
            {cells.map((cell) => {
              const cellClasses = [
                styles.cell,
                !cell.isCurrentMonth ? styles.cellOutside : '',
                cell.isWeekend ? styles.cellWeekend : '',
                cell.noDriversBlock && cell.closedBlock ? styles.cellBoth : cell.noDriversBlock ? styles.cellNoDrivers : cell.closedBlock ? styles.cellClosed : '',
                cell.key === selectedKey ? styles.cellSelected : '',
                cell.isToday ? styles.cellToday : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={cell.key}
                  type="button"
                  className={cellClasses}
                  onClick={() => setSelectedKey(cell.key)}
                >
                  <span className={styles.cellDay}>{cell.day}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchNoDrivers}`} />
              No drivers — set by Null Device
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchClosed}`} />
              Agency closed — set by the customer
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSwatchWeekend}`} />
              Weekend
            </span>
          </div>
        </div>
      </Card>

      <div className={styles.sidebar}>
        <Card title={formatLongDate(selectedKey)}>
          <div className={styles.detailPanel}>
            {loading ? (
              <p className={styles.mutedText}>Loading…</p>
            ) : (
              <>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Drivers available</span>
                  <span className={selectedNoDriversBlock ? styles.statBad : styles.statGood}>
                    {selectedNoDriversBlock ? 'Blocked' : 'Available'}
                  </span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Agency</span>
                  <span className={selectedClosedBlock ? styles.statBad : styles.statGood}>
                    {selectedClosedBlock ? 'Closed' : 'Open'}
                  </span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Deliveries</span>
                  <span className={styles.statGood}>{deliveriesByDate.get(selectedKey) || 0}</span>
                </div>

                {(selectedNoDriversBlock?.reason || selectedClosedBlock?.reason) && (
                  <div className={styles.reasonNote}>
                    {selectedNoDriversBlock?.reason || selectedClosedBlock?.reason}
                  </div>
                )}

                {actionError && <p className={styles.actionError}>{actionError}</p>}

                {canWriteNoDrivers && (
                  <div className={styles.editSection}>
                    {!selectedNoDriversBlock && (
                      <>
                        <Field label="Reason" htmlFor="cal-no-drivers-reason" hint="Shown to the customer on their calendar">
                          <Input
                            id="cal-no-drivers-reason"
                            value={reasonDraft}
                            onChange={(e) => setReasonDraft(e.target.value)}
                            placeholder="Driver vacation, public holiday, depot closed"
                            disabled={actionPending}
                          />
                        </Field>
                        <Switch
                          checked={applyToAllCustomers}
                          onChange={(e) => setApplyToAllCustomers(e.target.checked)}
                          label="Apply to every customer"
                          disabled={actionPending}
                        />
                      </>
                    )}
                    <Button
                      type="button"
                      variant={selectedNoDriversBlock ? 'secondary' : 'primary'}
                      loading={actionPending}
                      disabled={actionPending}
                      onClick={() => void handleToggleNoDrivers()}
                    >
                      {selectedNoDriversBlock ? 'Remove block' : applyToAllCustomers ? 'Block this day for every customer' : 'Block this day'}
                    </Button>
                  </div>
                )}

                {canWriteClosed && (
                  <div className={styles.editSection}>
                    {!selectedClosedBlock && (
                      <Field label="Reason" htmlFor="cal-closed-reason" hint="Optional — helps us plan the run either side">
                        <Input
                          id="cal-closed-reason"
                          value={reasonDraft}
                          onChange={(e) => setReasonDraft(e.target.value)}
                          placeholder="Christmas shutdown, public holiday, office closed"
                          disabled={actionPending}
                        />
                      </Field>
                    )}
                    <Button
                      type="button"
                      variant={selectedClosedBlock ? 'secondary' : 'primary'}
                      loading={actionPending}
                      disabled={actionPending}
                      onClick={() => void handleToggleClosed()}
                    >
                      {selectedClosedBlock ? 'Reopen this day' : 'Mark closed'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled title="Coming soon">
                      Close a date range
                    </Button>
                  </div>
                )}

                {role === 'customer-readonly' && (
                  <p className={styles.mutedText}>
                    Your account owner marks office closures. If you need a day added, ask them — or add it as a route instruction.
                  </p>
                )}
              </>
            )}
          </div>
        </Card>

        <Card title="Blocked days ahead" subtitle="Next 8, both sides">
          {upcoming.length === 0 ? (
            <p className={styles.mutedText}>No upcoming blocked days.</p>
          ) : (
            <div className={styles.upcomingList}>
              {upcoming.map((item) => (
                <button
                  key={`${item.key}-${item.badge}`}
                  type="button"
                  className={styles.upcomingRow}
                  onClick={() => goToDate(item.key)}
                >
                  <span className={styles.upcomingDate}>{formatShortDate(item.key)}</span>
                  <span className={styles.upcomingLabel}>{item.label}</span>
                  <span className={item.badge === 'No drivers' ? styles.badgeNoDrivers : styles.badgeClosed}>{item.badge}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
