import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { ApiPagination, TableColumn } from "@saas-kit/shared";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Input } from "./Input";
import { currency, date } from "../../lib/format";

export function DataTable({
  title,
  columns,
  rows,
  pagination,
  search,
  onSearch,
  onPageChange
}: {
  title: string;
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
  pagination: ApiPagination;
  search: string;
  onSearch: (value: string) => void;
  onPageChange: (page: number) => void;
}) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const left = String(a[sort.key] ?? "");
      const right = String(b[sort.key] ?? "");
      return sort.direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
  }, [rows, sort]);

  const renderCell = (column: TableColumn, row: Record<string, unknown>) => {
    const value = row[column.key];
    if (column.type === "status") return <Badge value={value} />;
    if (column.type === "currency") return currency(value);
    if (column.type === "date") return date(value);
    if (column.type === "percent") return `${value}%`;
    return String(value ?? "");
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{title}</h3>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input className="pl-9" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search table" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400">
                  <button
                    className="inline-flex items-center gap-1 hover:text-zinc-950 dark:hover:text-white"
                    onClick={() =>
                      setSort((current) => ({
                        key: column.key,
                        direction: current?.key === column.key && current.direction === "asc" ? "desc" : "asc"
                      }))
                    }
                  >
                    {column.label}
                    {sort?.key === column.key ? sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => (
              <tr key={String(row.id ?? index)} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                {columns.map((column) => (
                  <td key={column.key} className="max-w-xs px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    <span className="line-clamp-2">{renderCell(column, row)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Page {pagination.page} of {pagination.pageCount} · {pagination.total} records
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button variant="secondary" size="sm" disabled={pagination.page >= pagination.pageCount} onClick={() => onPageChange(pagination.page + 1)}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
