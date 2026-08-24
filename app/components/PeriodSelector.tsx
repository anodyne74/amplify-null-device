import React from 'react';
import { Field } from '@/app/components/ui/forms/Field';
import { Select } from '@/app/components/ui/forms/Select';

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
    <Field label={label} htmlFor="period-selector">
      <Select
        id="period-selector"
        value={selectedPeriod}
        onChange={(e) => onChange(e.target.value as TPeriod)}
      >
        {availablePeriods.map((period) => (
          <option key={period} value={period}>
            {PERIOD_LABELS[period]}
          </option>
        ))}
      </Select>
    </Field>
  );
}
