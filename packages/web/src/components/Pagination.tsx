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
  const safePage = Math.max(1, page);
  const fallbackTotalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  const safeTotalPages = Math.max(1, totalPages || 0, fallbackTotalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const pages: (number | '...')[] = [];
  if (safeTotalPages <= 7) {
    for (let i = 1; i <= safeTotalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (safePage > 3) pages.push('...');
    for (let i = Math.max(2, safePage - 1); i <= Math.min(safeTotalPages - 1, safePage + 1); i++) {
      pages.push(i);
    }
    if (safePage < safeTotalPages - 2) pages.push('...');
    pages.push(safeTotalPages);
  }

  return (
    <div
      className="pagination-bar"
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        borderTop: '1px solid #e1e3e5',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ color: '#4b5563', fontSize: '14px' }}>
          {total === 0 ? 'No results' : `Showing ${start}-${end} of ${total}`}
        </span>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            style={{ fontSize: '14px', border: '1px solid #c9cccf', borderRadius: '6px', padding: '4px 8px' }}
          >
            {pageSizeOptions.map(s => (
              <option key={s} value={s}>{s} per page</option>
            ))}
          </select>
        )}
      </div>
      {safeTotalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
          >
            Prev
          </button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} style={{ padding: '6px 8px', color: '#6d7175' }}>…</span>
            ) : (
              <button
                type="button"
                key={p}
                className={p === safePage ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                onClick={() => onPageChange(p as number)}
              >
                {String(p)}
              </button>
            )
          )}
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= safeTotalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
