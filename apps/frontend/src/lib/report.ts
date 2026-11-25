import { ledgerDashboards, type DashboardId } from "@saas-kit/shared";
import { api, sessionStore } from "./api";
import { readLedgerPage, readReport } from "./report-response";
import { isDemo, loadDemoDashboard } from "./demo";

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

export async function loadReport(id: DashboardId, params: URLSearchParams, signal?: AbortSignal) {
  if (!isDemo) return readReport(id, await api<unknown>(`/dashboard-data/${id}?${params}`, {signal}));
  checkAborted(signal);
  const report = await loadDemoDashboard(id, params.toString());
  checkAborted(signal);
  return report;
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function* reportPages(id: DashboardId, query: URLSearchParams, signal: AbortSignal) {
  const params = new URLSearchParams(query);
  params.set("pageSize", "50");
  const session = isDemo ? undefined : sessionStore.get()?.refreshToken;
  function checkSession() {
    checkAborted(signal);
    if (!isDemo && session !== sessionStore.get()?.refreshToken) throw new DOMException("Session changed", "AbortError");
  }
  const seen = new Set<unknown>();
  let period: string | undefined;
  let total: number | undefined, pageCount = 1;
  for (let page = 1; page <= pageCount; page++) {
    checkSession();
    params.set("page", String(page));
    const {table, periodLabel} = !isDemo && ledgerDashboards.some((key) => key === id)
      ? readLedgerPage(await api<unknown>(`/dashboard-data/${id}/records?${params}`, {signal}))
      : await loadReport(id, params, signal);
    checkSession();
    if (page === 1) period = periodLabel;
    total ??= table.pagination.total;
    pageCount = Math.max(1, Math.ceil(total / 50));
    const changed = () => new Error("The records changed while loading. Please try again.");
    if (period !== periodLabel || table.pagination.total !== total || table.pagination.page !== page || table.pagination.pageCount !== pageCount ||
        table.rows.length !== Math.min(50, total - seen.size)) throw changed();
    for (const row of table.rows) {
      if (row.id == null || seen.has(row.id)) throw changed();
      seen.add(row.id);
    }
    yield table;
  }
  checkSession();
}

export async function downloadReport(id: DashboardId, query: URLSearchParams, signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void) {
  const lines: string[] = [];
  let loaded = 0;
  for await (const table of reportPages(id, query, signal)) {
    if (!lines.length) lines.push(table.columns.map((column) => csvCell(column.label)).join(","));
    for (const row of table.rows) lines.push(table.columns.map(({ key }) => csvCell(row[key])).join(","));
    loaded += table.rows.length;
    onProgress(loaded, table.pagination.total);
  }
  checkAborted(signal);
  downloadCsv(id === "finance" && query.get("ledger") === "invoices" ? "outstanding-invoices" : id, lines);
}

function downloadCsv(id: string, lines: string[]) {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "northstar-" + id + ".csv";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadWorksheet(rows: Array<Array<string | number>>, name = "reorder-plan") {
  downloadCsv(name, rows.map((row) => row.map(csvCell).join(",")));
}
