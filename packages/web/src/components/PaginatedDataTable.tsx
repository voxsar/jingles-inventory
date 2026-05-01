import { useEffect, useMemo, useState } from 'react';
import DataTable from './DataTable';
import Pagination from './Pagination';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
}

interface PaginatedDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: string;
  onRowClick?: (row: T) => void;
  initialPageSize?: number;
  pageSizeOptions?: number[];
}

export default function PaginatedDataTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  emptyMessage,
  emptyIcon,
  onRowClick,
  initialPageSize = 20,
  pageSizeOptions,
}: PaginatedDataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  return (
    <>
      <DataTable
        columns={columns}
        data={pagedData}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        emptyIcon={emptyIcon}
        onRowClick={onRowClick}
      />
      {!isLoading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </>
  );
}
