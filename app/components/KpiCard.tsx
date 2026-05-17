import React from 'react';

interface KpiCardProps {
  title: string;
  value: number | string;
  delta?: number; // Optional delta for comparison
  subtitle?: string;
  comparison?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, delta, subtitle, comparison }) => {
  const deltaColor = delta && delta > 0 ? 'var(--nd-accent-primary)' : delta && delta < 0 ? 'var(--nd-status-danger)' : 'var(--nd-text-muted)';

  return (
    <div
      style={{
        backgroundColor: 'var(--nd-bg-surface)',
        border: '1px solid var(--nd-border-subtle)',
        borderRadius: 'var(--nd-radius-lg)',
        padding: 'var(--nd-space-md)',
        textAlign: 'center',
        display: 'grid',
        gap: 'var(--nd-space-xs)',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--nd-font-display)',
          fontSize: '0.9rem',
          letterSpacing: '0.04em',
          color: 'var(--nd-text-primary)',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: '1.6rem',
          lineHeight: 1,
          fontWeight: 700,
          fontFamily: 'var(--nd-font-mono)',
          color: 'var(--nd-accent-primary)',
        }}
      >
        {value}
      </p>
      {delta !== undefined && (
        <p
          style={{
            margin: 0,
            color: deltaColor,
            fontFamily: 'var(--nd-font-body)',
            fontSize: '0.8rem',
            letterSpacing: '0.02em',
          }}
        >
          {delta > 0 ? `+${delta}` : delta}% from last period
        </p>
      )}
      {subtitle && (
        <p
          style={{
            margin: 0,
            color: 'var(--nd-text-muted)',
            fontFamily: 'var(--nd-font-body)',
            fontSize: '0.72rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {subtitle}
        </p>
      )}
      {comparison && (
        <p
          style={{
            margin: 0,
            color: 'var(--nd-text-secondary)',
            fontFamily: 'var(--nd-font-body)',
            fontSize: '0.72rem',
            letterSpacing: '0.02em',
          }}
        >
          {comparison}
        </p>
      )}
    </div>
  );
};

export default KpiCard;