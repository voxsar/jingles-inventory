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
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

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
    <s-stack direction="inline" gap="base" style={{ padding: '12px 16px', borderTop: '1px solid #e1e3e5', alignItems: 'center', justifyContent: 'space-between' }}>
      <s-stack direction="inline" gap="small">
        <s-text>{total === 0 ? 'No results' : `Showing ${start}–${end} of ${total}`}</s-text>
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
      </s-stack>
      {totalPages > 1 && (
        <s-stack direction="inline" gap="small-100">
          <s-button onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}>← Prev</s-button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} style={{ padding: '6px 8px', color: '#6d7175' }}>…</span>
            ) : (
              <s-button
                key={p}
                variant={p === safePage ? 'primary' : undefined}
                onClick={() => onPageChange(p as number)}
              >
                {String(p)}
              </s-button>
            )
          )}
          <s-button onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages}>Next →</s-button>
        </s-stack>
      )}
    </s-stack>
  );
}
