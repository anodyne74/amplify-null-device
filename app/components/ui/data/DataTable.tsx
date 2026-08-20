import React from 'react';

export interface DataColumn<T = any> {
  key: string;
  header: React.ReactNode;
  /** Right-aligns and sets tabular mono figures — money, counts, durations. */
  numeric?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string | number;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T = any> extends Omit<React.TableHTMLAttributes<HTMLTableElement>, 'children'> {
  columns: DataColumn<T>[];
  rows: T[];
  hoverable?: boolean;
  /** Wraps in a bordered card shell. Set false inside a padded={false} Card. */
  wrapped?: boolean;
  empty?: React.ReactNode;
}

export function DataTable<T extends { id?: string | number } = any>({
  columns = [],
  rows = [],
  hoverable = true,
  wrapped = true,
  empty = 'Nothing here yet',
  className = '',
  ...rest
}: DataTableProps<T>) {
  const table = (
    <table className={`nd-table ${hoverable ? 'nd-table--hoverable' : ''} ${className}`} {...rest}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ textAlign: c.align || 'left', width: c.width }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: 'var(--space-10)' }}>
              {empty}
            </td>
          </tr>
        )}
        {rows.map((r, i) => (
          <tr key={r.id ?? i}>
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'nd-table__num' : ''} style={{ textAlign: c.align || (c.numeric ? 'right' : 'left') }}>
                {c.render ? c.render(r) : (r as any)[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return wrapped ? <div className="nd-table__wrap">{table}</div> : table;
}
