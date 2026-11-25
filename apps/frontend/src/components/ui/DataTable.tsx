import { useId } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { reportSearchFields, type DashboardResponse } from "@saas-kit/shared";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Input } from "./Input";
import { cellText, titleCase } from "../../lib/format";

type Props = {
  data: DashboardResponse;
  actions: React.ReactNode;
  navigation?: React.ReactNode;
  params: URLSearchParams;
  change: (values: Record<string, string>, replace?: boolean) => void;
  onOpen: (row: Record<string, unknown>) => void;
  onExport: () => void;
  exportProgress: string | null;
  onCancelExport: () => void;
  fetching: boolean;
};

export function DataTable({ data, actions, navigation, params, change, onOpen, onExport, exportProgress, onCancelExport, fetching }: Props) {
  const filterId = useId();
  const { columns, rows, pagination, title } = data.table;
  const recordKey = data.table.recordKey ?? columns[0]?.key;
  const search = params.get("search") ?? "";
  const sort = params.get("sort");
  const descending = params.get("direction") === "desc";
  const hasFilters = !!search || data.filters.some(({ key }) => !!params.get(key));
  function clear() {
    const cleared: Record<string, string> = { search: "", page: "" };
    for (const { key } of data.filters) cleared[key] = "";
    change(cleared);
  }
  return (
    <section id="report-table" tabIndex={-1} aria-label={title} className="min-w-0 scroll-mt-20 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {navigation}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {exportProgress !== null ? <div className="flex flex-wrap items-center gap-2"><span role="status" className="text-xs tabular-nums">{exportProgress}</span>
          <Button variant="secondary" size="sm" onClick={onCancelExport}>Cancel export</Button></div> :
          <Button variant="secondary" size="sm" disabled={fetching || !pagination.total} onClick={onExport}><Download size={14} />Export CSV</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-y border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold"><span>Search records</span>
          <span className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-zinc-400" size={15} />
          <Input type="search" className="pl-9" value={search} placeholder={columns.filter((c) => (data.table.searchFields ?? reportSearchFields[data.id]).includes(c.key)).map((c) => c.label).join(", ")} maxLength={150}
            onChange={(e) => change({ search: e.target.value, page: "" }, true)} /></span>
        </label>
        {data.filters.map(({ key, label, options }) => <div key={key} className="grid min-w-0 max-w-full gap-1 text-xs font-semibold sm:max-w-80"><label htmlFor={filterId + key}>{label}</label>
          <select id={filterId + key} value={params.get(key) ?? options[0]?.value} onChange={(e) => change({ [key]: e.target.value === options[0]?.value ? "" : e.target.value, page: "" })}
            className="h-10 w-full min-w-0 max-w-full rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            {options.map(({ value, label }) => <option key={value} value={value}>{key === "service" || key === "aging" ? label : value === "all" ? "All" : titleCase(label)}</option>)}
          </select></div>)}
        {hasFilters && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}
      </div>
      <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">{actions}</div>
      <div role="region" aria-label={title + " rows"} tabIndex={0} aria-busy={fetching} className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <thead><tr className="border-b border-zinc-200 dark:border-zinc-800">
            {columns.map((column) => <th scope="col" key={column.key} aria-sort={sort === column.key ? descending ? "descending" : "ascending" : undefined}
              className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {column.sortable === false ? column.label : <button className="inline-flex items-center gap-1" onClick={() =>
                change({ sort: column.key, direction: sort === column.key && !descending ? "desc" : "asc", page: "" })}>{column.label}
                {sort !== column.key ? <ArrowUpDown size={12} /> : descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              </button>}
            </th>)}
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={String(row.id)} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900">
            {columns.map((column) => <td key={column.key} className="max-w-xs px-4 py-3">
              {column.key === recordKey ? <button className="text-left font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 dark:text-emerald-300" disabled={fetching} onClick={() => onOpen(row)}>{cellText(column, row[column.key])}</button> :
                column.type === "status" ? <Badge value={row[column.key]} /> : cellText(column, row[column.key])}
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="grid justify-items-center gap-2 py-8"><p className="font-semibold">No matching records</p>
        {hasFilters && <Button variant="secondary" size="sm" onClick={clear}>Show all records</Button>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
        <span aria-live="polite">{pagination.total ? `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total} records` : "0 records"}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={fetching || pagination.page <= 1} onClick={() => change({ page: String(pagination.page - 1) })}><ChevronLeft size={14} />Prev</Button>
          <Button variant="secondary" size="sm" disabled={fetching || pagination.page >= pagination.pageCount} onClick={() => change({ page: String(pagination.page + 1) })}>Next<ChevronRight size={14} /></Button>
        </div>
      </div>
    </section>
  );
}
