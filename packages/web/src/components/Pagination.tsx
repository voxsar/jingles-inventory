import clsx from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  // Clamp page to valid range
  const safePage = Math.max(1, page);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  // Build page numbers: always show first, last, and a window around the current page
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (safePage > 3) pages.push('...');
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
      pages.push(i);
    }
    if (safePage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
      {/* Left: showing X–Y of Z */}
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-500">
          {total === 0 ? 'No results' : `Showing ${start}–${end} of ${total}`}
        </p>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {pageSizeOptions.map(s => (
              <option key={s} value={s}>{s} per page</option>
            ))}
          </select>
        )}
      </div>

      {/* Right: page navigation */}
      {totalPages > 1 && (
        <nav className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-md border font-medium transition-colors',
              page <= 1
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            )}
          >
            ← Prev
          </button>

          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-gray-400">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                className={clsx(
                  'px-3 py-1.5 text-sm rounded-md border font-medium transition-colors',
                  p === safePage
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                )}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-md border font-medium transition-colors',
              page >= totalPages
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            )}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
