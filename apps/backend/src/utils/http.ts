export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const centsToCurrency = (cents: number) =>
  Number((cents / 100).toFixed(2));

// PostgreSQL treats these characters as wildcards in contains filters.
export const containsText = (text?: string) => ({
  contains: text?.replace(/[\\%_]/g, "\\$&"),
  mode: "insensitive" as const
});

export const pageArgs = (page?: unknown, pageSize?: unknown) => {
  const parsedPage = Math.min(100000, Math.max(Math.floor(Number(page)) || 1, 1));
  const parsedSize = Math.min(Math.max(Math.floor(Number(pageSize)) || 10, 1), 50);
  return {
    page: parsedPage,
    pageSize: parsedSize,
    skip: (parsedPage - 1) * parsedSize,
    take: parsedSize
  };
};

export const pagination = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  pageCount: Math.max(Math.ceil(total / pageSize), 1)
});

export function reportOrder<T>(sort: unknown, columns: Record<string, T>, fallback: T, tie: T): T[] {
  const key = String(sort ?? "");
  return [Object.hasOwn(columns, key) ? columns[key] : fallback, tie];
}
