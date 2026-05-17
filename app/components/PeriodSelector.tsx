import React from 'react';

interface PeriodSelectorProps {
  selectedPeriod: 'week' | 'month' | 'quarter' | 'year';
  onChange: (period: 'week' | 'month' | 'quarter' | 'year') => void;
}

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ selectedPeriod, onChange }) => {
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
        Select Period
      </label>
      <select
        id="period-selector"
        value={selectedPeriod}
        onChange={(e) => onChange(e.target.value as 'week' | 'month' | 'quarter' | 'year')}
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
        <option value="week">Week</option>
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
      </select>
    </div>
  );
};

export default PeriodSelector;