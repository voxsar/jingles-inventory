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
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
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
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ background: '#f6f6f7' }}>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                onClick={() => col.sortable && handleSort(String(col.key))}
                style={{
                  padding: '12px 16px',
                  textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                  fontWeight: 600,
                  fontSize: '12px',
                  color: '#6d7175',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: col.sortable ? 'pointer' : 'default',
                  borderBottom: '1px solid #e1e3e5',
                  userSelect: 'none',
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
              <tr key={i}>
                {Array.from({ length: columns.length }).map((_, j) => (
                  <td key={j} style={{ padding: '12px 16px', borderBottom: '1px solid #e1e3e5' }}>
                    <div style={{ height: '16px', background: '#e1e3e5', borderRadius: '4px', width: `${60 + (j * 13) % 40}%` }} />
                  </td>
                ))}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '48px 16px', textAlign: 'center', color: '#6d7175' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{emptyIcon}</div>
                <s-text>{emptyMessage}</s-text>
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: idx % 2 === 1 ? '#fafbfb' : 'white',
                  borderBottom: '1px solid #e1e3e5',
                }}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    style={{
                      padding: '12px 16px',
                      fontSize: '14px',
                      textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                      whiteSpace: 'nowrap',
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

