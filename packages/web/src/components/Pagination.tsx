import SearchableSelect from './SearchableSelect';

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
    <div className="pagination-bar">
      <div className="pagination-summary">
        <span>
          {total === 0 ? 'No results' : `Showing ${start}-${end} of ${total}`}
        </span>
        {onPageSizeChange && (
          <SearchableSelect
            options={pageSizeOptions.map((size) => ({ value: String(size), label: `${size} per page` }))}
            className="min-w-[140px]"
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            isClearable={false}
          />
        )}
      </div>
      {safeTotalPages > 1 && (
        <div className="pagination-actions">
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
              <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
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
