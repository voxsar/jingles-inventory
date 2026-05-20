import { useState } from 'react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: string;
  onRowClick?: (row: T) => void;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No data found',
  emptyIcon = '📭',
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av === bv) return 0;
        const result = av < bv ? -1 : 1;
        return sortDir === 'asc' ? result : -result;
      })
    : data;

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                onClick={() => col.sortable && handleSort(String(col.key))}
                className={`data-table__header${col.sortable ? ' is-sortable' : ''}`}
                style={{
                  textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                }}
              >
                {col.header}
                {col.sortable && sortKey === String(col.key) && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="data-table__row">
                {Array.from({ length: columns.length }).map((_, j) => (
                  <td key={j} className="data-table__cell">
                    <div className="data-table__skeleton" style={{ width: `${60 + (j * 13) % 40}%` }} />
                  </td>
                ))}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="data-table__empty">
                <div className="data-table__empty-icon">{emptyIcon}</div>
                <span>{emptyMessage}</span>
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={`data-table__row${onRowClick ? ' is-clickable' : ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className="data-table__cell"
                    style={{
                      textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                    }}
                  >
                    {col.render ? col.render(row) : String(row[String(col.key)] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
