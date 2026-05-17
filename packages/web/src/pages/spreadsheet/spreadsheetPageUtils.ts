import { useEffect, useMemo, useState } from 'react';

export const getApiResponseData = (response: any) => response?.data?.data ?? response?.data ?? {};

export const getApiListItems = (response: any) => {
  const data = getApiResponseData(response);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

export type ListRequest = (params?: Record<string, string>) => Promise<any>;

export const DEFAULT_SPREADSHEET_PAGE_SIZE = 100;

export interface SpreadsheetPageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export const fetchSpreadsheetPage = async <T = any>(
  list: ListRequest,
  params: Record<string, string> = {},
  page = 1,
  pageSize = DEFAULT_SPREADSHEET_PAGE_SIZE,
): Promise<SpreadsheetPageResult<T>> => {
  const response = await list({
    ...params,
    page: String(page),
    pageSize: String(pageSize),
  });

  const data = getApiResponseData(response);
  const items = getApiListItems(response) as T[];
  const total = Number(data?.total);
  const totalPages = Number(data?.totalPages);
  const normalizedTotal = Number.isFinite(total) ? total : items.length;
  const normalizedTotalPages = Number.isFinite(totalPages) && totalPages > 0
    ? totalPages
    : Math.max(1, Math.ceil(normalizedTotal / pageSize));

  return {
    items,
    total: normalizedTotal,
    page: Number(data?.page) || page,
    pageSize: Number(data?.pageSize) || pageSize,
    totalPages: normalizedTotalPages,
    hasMore: page < normalizedTotalPages,
  };
};

interface UseLazySpreadsheetRowsOptions {
  params?: Record<string, string>;
  pageSize?: number;
  searchTerm?: string;
  searchParamName?: string;
  enabled?: boolean;
}

export const useLazySpreadsheetRows = <T = any>(
  list: ListRequest,
  {
    params = {},
    pageSize = DEFAULT_SPREADSHEET_PAGE_SIZE,
    searchTerm = '',
    searchParamName = 'search',
    enabled = true,
  }: UseLazySpreadsheetRowsOptions = {},
) => {
  const requestParams = useMemo(() => {
    const nextParams = { ...params };
    const trimmedSearch = searchTerm.trim();

    if (searchParamName) {
      if (trimmedSearch) nextParams[searchParamName] = trimmedSearch;
      else delete nextParams[searchParamName];
    }

    return nextParams;
  }, [params, searchParamName, searchTerm]);

  const requestSignature = JSON.stringify(requestParams);

  const [rows, setRows] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [hasMoreRows, setHasMoreRows] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let isCancelled = false;

    const loadFirstPage = async () => {
      setIsLoading(true);
      try {
        const result = await fetchSpreadsheetPage<T>(list, requestParams, 1, pageSize);
        if (isCancelled) return;

        setRows(result.items);
        setPage(result.page);
        setTotalRows(result.total);
        setHasMoreRows(result.hasMore);
      } catch (error) {
        if (!isCancelled) {
          console.error(error);
          setRows([]);
          setPage(1);
          setTotalRows(0);
          setHasMoreRows(false);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadFirstPage();

    return () => {
      isCancelled = true;
    };
  }, [enabled, list, pageSize, requestSignature]);

  const loadMoreRows = async () => {
    if (!enabled || isLoading || isLoadingMore || !hasMoreRows) return;

    const nextPage = page + 1;
    setIsLoadingMore(true);

    try {
      const result = await fetchSpreadsheetPage<T>(list, requestParams, nextPage, pageSize);
      setRows((current) => [...current, ...result.items]);
      setPage(result.page);
      setTotalRows(result.total);
      setHasMoreRows(result.hasMore);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return {
    rows,
    setRows,
    isLoading,
    isLoadingMore,
    page,
    totalRows,
    setTotalRows,
    hasMoreRows,
    loadMoreRows,
  };
};

export const fetchAllSpreadsheetRows = async <T = any>(
  list: ListRequest,
  params: Record<string, string> = {},
  pageSize = 1000,
): Promise<T[]> => {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await list({ ...params, page: String(page), pageSize: String(pageSize) });
    const data = getApiResponseData(response);
    const items = getApiListItems(response) as T[];
    rows.push(...items);

    const nextTotalPages = Number(data?.totalPages);
    if (!Number.isFinite(nextTotalPages) || nextTotalPages <= 0) break;

    totalPages = nextTotalPages;
    if (page >= totalPages || items.length === 0) break;
    page += 1;
  }

  return rows;
};

export const mergeUpdatedRow = <T extends Record<string, any>>(
  current: T,
  changes: Partial<T>,
  response: any,
) => ({
  ...current,
  ...changes,
  ...getApiResponseData(response),
});

export const buildCreatedRow = <T extends Record<string, any>>(
  data: Partial<T>,
  response: any,
) => ({
  ...data,
  ...getApiResponseData(response),
});
