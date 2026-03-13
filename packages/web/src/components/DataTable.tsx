import { useState } from 'react';
import clsx from 'clsx';

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

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
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
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                onClick={() => col.sortable && handleSort(String(col.key))}
                className={clsx(
                  'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none',
                  col.sortable && 'cursor-pointer hover:bg-gray-100 hover:text-gray-900',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <span className={clsx(
                      'text-gray-400 transition-opacity',
                      sortKey === String(col.key) ? 'opacity-100 text-primary-600' : 'opacity-0 group-hover:opacity-50'
                    )}>
                      {sortKey === String(col.key) ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center">
                <div className="text-3xl mb-2">{emptyIcon}</div>
                <p className="text-sm text-gray-500">{emptyMessage}</p>
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={clsx(
                  'transition-colors',
                  onRowClick ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50',
                  idx % 2 === 1 && 'bg-gray-50/40',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={clsx(
                      'px-4 py-3 text-sm text-gray-800 whitespace-nowrap',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                    )}
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
