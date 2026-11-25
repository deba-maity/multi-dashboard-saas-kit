import type { DashboardId, DashboardResponse } from "@saas-kit/shared";
import { ApiError } from "./api";

export function readLedgerPage(value: unknown): Pick<DashboardResponse, "table" | "periodLabel"> {
  const page = value as Partial<DashboardResponse> | null;
  const table = page?.table;
  if (!table || !Array.isArray(table.rows) || !Array.isArray(table.columns) || !table.pagination ||
    !Number.isSafeInteger(table.pagination.page) || table.pagination.page < 1 ||
    !Number.isSafeInteger(table.pagination.pageSize) || table.pagination.pageSize < 1 ||
    !Number.isSafeInteger(table.pagination.total) || table.pagination.total < 0 ||
    !Number.isSafeInteger(table.pagination.pageCount) || table.pagination.pageCount < 1) {
    throw new ApiError(502, "The report could not be read. Please retry.");
  }
  return { table, periodLabel: page?.periodLabel };
}

export function readReport(id: DashboardId, value: unknown): DashboardResponse {
  const report = value as Partial<DashboardResponse> | null;
  if (report?.id !== id || typeof report.title !== "string" || !Array.isArray(report.metrics) ||
    !Array.isArray(report.charts) || !Array.isArray(report.widgets) || !Array.isArray(report.filters)) {
    throw new ApiError(502, "The report could not be read. Please retry.");
  }
  readLedgerPage(value);
  return report as DashboardResponse;
}
