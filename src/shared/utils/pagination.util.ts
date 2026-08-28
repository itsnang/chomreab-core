import type { PaginatedResult } from '../interfaces/paginated-result.interface';

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
  baseUrl: string,
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const url = (p: number) => `${baseUrl}&page=${p}`;
  return {
    items,
    meta: { total, page, limit, total_pages: totalPages },
    _links: {
      self: url(page),
      first: url(1),
      last: url(totalPages),
      next: page < totalPages ? url(page + 1) : null,
      prev: page > 1 ? url(page - 1) : null,
    },
  };
}
