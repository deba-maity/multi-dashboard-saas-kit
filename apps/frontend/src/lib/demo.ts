import { readBrowserRecord, writeBrowserRecord, withBrowserLock } from "./browser-records";
import { readReport } from "./report-response";
import { ApiError } from "./api";
import { monitoringSummary, projectSummary, reportSearchFields, taskStatuses, type DashboardId, type DashboardResponse, type TaskStatus } from "@saas-kit/shared";

export const isDemo = import.meta.env.MODE === "pages-demo";

const snapshots = new Map<string, Promise<DashboardResponse>>();
function snapshot(id: DashboardId, period?: string | null, ledger?: string | null): Promise<DashboardResponse> {
  let name: string = id;
  if (id === "analytics" && (period === "30" || period === "90")) name += "-" + period;
  if (id === "finance" && ledger === "invoices") name += "-invoices";
  const cached = snapshots.get(name);
  if (cached) return cached;
  const pending = fetch(import.meta.env.BASE_URL + "demo/" + name + ".json")
    .then((response) => {
      if (!response.ok) throw new ApiError(response.status, "Unable to load the sample data. Please retry.");
      return response.json().then((value: unknown) => readReport(id, value), () => {
        throw new ApiError(502, "The report could not be read. Please retry.");
      });
    })
    .catch((error) => { snapshots.delete(name); throw error; });
  snapshots.set(name, pending);
  return pending;
}

const taskKey = (id: string) => "northstar.sample.task." + id;

function savedStatus(id: string) {
  const value = readBrowserRecord(taskKey(id));
  return taskStatuses.find((status) => status === value);
}

const taskLock = "northstar.sample.tasks";
export async function changeDemoTask(id: string, previousStatus: string, status: TaskStatus) {
  const data = await snapshot("projects");
  const task = data.table.rows.find((row) => row.id === id);
  if (!task) throw new Error("Task no longer exists in this sample.");
  return withBrowserLock(taskLock, () => {
    const current = savedStatus(id) ?? task.status;
    if (current !== previousStatus && current !== status) {
      throw new ApiError(409, "This task changed.", { currentStatus: current });
    }
    return writeBrowserRecord(taskKey(id), status === task.status ? null : status);
  });
}

export async function resetDemoTasks() {
  const data = await snapshot("projects");
  return withBrowserLock(taskLock, () => {
    let persisted = true;
    for (const task of data.table.rows) {
      if (!writeBrowserRecord(taskKey(String(task.id)), null)) persisted = false;
    }
    return persisted;
  });
}

export async function loadDemoDashboard(id: DashboardId, query: string): Promise<DashboardResponse> {
  const params = new URLSearchParams(query);
  const original = await snapshot(id, params.get("period"), params.get("ledger"));
  const data = { ...original, table: { ...original.table } };
  if (id === "projects") {
    const tasks = data.table.rows.map((row) => ({
      ...row, status: savedStatus(String(row.id)) ?? row.status, priority: row.priority
    }));
    data.table.rows = tasks;
    Object.assign(data, projectSummary(tasks));
  }
  const service = params.get("service");
  if (id === "monitoring" && service) {
    const events = original.table.rows.filter((row) => row.service === service);
    const latency = events.map((row) => Number(row.latencyMs)).sort((a, b) => a - b);
    const { levels, ...overview } = monitoringSummary({
      total: events.length, errors: events.filter((row) => row.level === "error").length,
      warnings: events.filter((row) => row.level === "warn").length, info: events.filter((row) => row.level === "info").length,
      p95: latency[Math.ceil(latency.length * .95) - 1] ?? null
    }, events.length ? 1 : 0, service);
    Object.assign(data, overview);
    data.charts = [levels, ...original.charts.filter((chart) => chart.filterKey !== "level")];
    data.filters = original.filters.map((filter) => filter.key === "service" && !filter.options.some((option) => option.value === service)
      ? { ...filter, options: [...filter.options, { label: service, value: service }] } : filter);
  }
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize")) || 10));
  const rows = data.table.rows.filter((row) =>
    data.filters.every(({ key, options }) => {
      const value = params.get(key);
      if (!value || value === options[0]?.value) return true;
      if (id === "finance" && key === "aging" && value === "past-due") return Number(row.daysPastDue) > 0;
      return key === "service" ? row[key] === value : String(row[key]).toLowerCase() === value.toLowerCase();
    }) && (!search || (data.table.searchFields ?? reportSearchFields[id]).some((key) =>
      String(row[key] ?? "").toLowerCase().includes(search)
    ))
  );
  const column = data.table.columns.find((item) => item.key === params.get("sort") && item.sortable !== false);
  if (column) {
    const direction = params.get("direction") === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const left = a[column.key], right = b[column.key];
      // The seed database orders text case-sensitively and places nulls last in ascending order.
      let order = 0;
      if (left == null || right == null) {
        order = Number(left == null) - Number(right == null);
        if (column.nullsLast && order) return order;
      }
      else if (typeof left === "number" && typeof right === "number") order = left - right;
      else if (String(left) !== String(right)) order = String(left) < String(right) ? -1 : 1;
      return order * direction || String(a.id).localeCompare(String(b.id));
    });
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number(params.get("page")) || 1));
  return {
    ...data, table: { ...data.table, rows: rows.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, pageCount, total: rows.length } }
  };
}
