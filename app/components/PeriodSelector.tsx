import React from 'react';

export type PeriodSelectorPeriod = 'week' | 'month' | 'quarter' | 'year';

const DEFAULT_PERIODS: readonly PeriodSelectorPeriod[] = ['week', 'month', 'quarter', 'year'];

const PERIOD_LABELS: Record<PeriodSelectorPeriod, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

interface PeriodSelectorProps<TPeriod extends PeriodSelectorPeriod = PeriodSelectorPeriod> {
  selectedPeriod: TPeriod;
  onChange: (period: TPeriod) => void;
  periods?: readonly TPeriod[];
  label?: string;
}

export default function PeriodSelector<TPeriod extends PeriodSelectorPeriod = PeriodSelectorPeriod>({
  selectedPeriod,
  onChange,
  periods,
  label = 'Select Period',
}: PeriodSelectorProps<TPeriod>) {
  const availablePeriods = periods ?? (DEFAULT_PERIODS as readonly TPeriod[]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        backgroundColor: 'var(--nd-bg-surface)',
        border: '1px solid var(--nd-border-subtle)',
        borderRadius: 'var(--nd-radius-lg)',
        padding: '0.75rem 1rem',
      }}
    >
      <label
        htmlFor="period-selector"
        style={{
          fontFamily: 'var(--nd-font-body)',
          fontSize: '0.75rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--nd-text-muted)',
        }}
      >
        {label}
      </label>
      <select
        id="period-selector"
        value={selectedPeriod}
        onChange={(e) => onChange(e.target.value as TPeriod)}
        style={{
          minWidth: '140px',
          backgroundColor: 'var(--nd-bg-void)',
          color: 'var(--nd-text-primary)',
          border: '1px solid var(--nd-border-default)',
          borderRadius: 'var(--nd-radius-md)',
          padding: '0.65rem 0.75rem',
          fontFamily: 'var(--nd-font-body)',
          fontSize: '0.875rem',
        }}
      >
        {availablePeriods.map((period) => (
          <option key={period} value={period}>
            {PERIOD_LABELS[period]}
          </option>
        ))}
      </select>
    </div>
  );
}
