import type { DashboardId, DashboardResponse } from "@saas-kit/shared";
import { api } from "./api";
import { isDemo, loadDemoDashboard } from "./demo";

export function loadReport(id: DashboardId, params: URLSearchParams) {
  return isDemo ? loadDemoDashboard(id, params.toString()) :
    api<DashboardResponse>(`/dashboard-data/${id}?${params}`);
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function downloadReport(id: DashboardId, query: URLSearchParams) {
  const params = new URLSearchParams(query);
  params.set("page", "1");
  params.set("pageSize", "50");
  let { table } = await loadReport(id, params);
  const { columns, pagination } = table;
  const lines = [columns.map((column) => csvCell(column.label)).join(",")];
  for (let page = 1; page <= pagination.pageCount; page++) {
    if (page > 1) {
      params.set("page", String(page));
      table = (await loadReport(id, params)).table;
    }
    for (const row of table.rows) lines.push(columns.map(({ key }) => csvCell(row[key])).join(","));
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "northstar-" + id + ".csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
