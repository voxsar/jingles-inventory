export function getPagination(query: Record<string, unknown>, defaultPageSize = 50) {
	const pageParam = typeof query.page === 'string' ? query.page : undefined;
	const pageSizeParam = typeof query.pageSize === 'string' ? query.pageSize : undefined;
	const isPaginated = pageParam !== undefined || pageSizeParam !== undefined;
	const parsedPage = Number.parseInt(pageParam ?? '1', 10);
	const parsedPageSize = Number.parseInt(pageSizeParam ?? String(defaultPageSize), 10);
	const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	const pageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, 1000) : defaultPageSize;

	return {
		isPaginated,
		page,
		pageSize,
		skip: (page - 1) * pageSize,
		take: pageSize,
	};
}

export function paginatedPayload<T>(items: T[], total: number, page: number, pageSize: number) {
	return {
		items,
		total,
		page,
		pageSize,
		totalPages: Math.max(1, Math.ceil(total / pageSize)),
	};
}
