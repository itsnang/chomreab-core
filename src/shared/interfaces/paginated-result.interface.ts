export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface PaginationLinks {
  self: string;
  first: string;
  last: string;
  next: string | null;
  prev: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
  _links: PaginationLinks;
}
