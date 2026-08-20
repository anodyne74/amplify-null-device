import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Strings or {id,label,count}. */
  items: Array<string | TabItem>;
  value?: string;
  onChange?: (id: string) => void;
  /** underline = section navigation; pill = a compact filter switch. */
  variant?: 'underline' | 'pill';
}

export function Tabs({ items = [], value, onChange, variant = 'underline', className = '', ...rest }: TabsProps) {
  const firstId = items[0] ? (typeof items[0] === 'string' ? items[0] : items[0].id) : undefined;
  const active = value ?? firstId;

  return (
    <div className={`nd-tabs ${variant === 'pill' ? 'nd-tabs--pill' : ''} ${className}`} role="tablist" {...rest}>
      {items.map((it) => {
        const id = typeof it === 'string' ? it : it.id;
        const label = typeof it === 'string' ? it : it.label;
        const count = typeof it === 'string' ? undefined : it.count;
        const on = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            className={`nd-tabs__tab ${on ? 'nd-tabs__tab--active' : ''}`}
            onClick={() => onChange?.(id)}
          >
            {label}
            {count !== undefined && <span className="nd-tabs__count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
