export type TenantRole = "ADMIN" | "MEMBER";

export type DashboardId =
  | "analytics"
  | "ecommerce"
  | "users"
  | "finance"
  | "inventory"
  | "projects"
  | "marketing"
  | "monitoring"
  | "crm"
  | "insights";

export const ledgerDashboards = ["finance", "inventory", "marketing", "monitoring"] as const;

export type ApiPagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type TableColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  nullsLast?: boolean;
  type?: "datetime" | "text" | "number" | "currency" | "date" | "status" | "percent";
};

export type DashboardMetric = {
  label: string;
  value: string | number;
  change?: number;
  drill?: { label: string; params: Record<string, string> };
  format?: "currency";
  tone?: "emerald" | "sky" | "amber" | "rose" | "violet";
};

export type ChartSeries = {
  name: string;
  kind?: "booked-revenue-scenario";
  filterKey?: string;
  unit?: "USD" | "ms";
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKeys: string[];
  type: "line" | "bar" | "area" | "pie";
};

export type DashboardResponse = {
  id: DashboardId;
  title: string;
  description: string;
  periodLabel?: string;
  metrics: DashboardMetric[];
  charts: ChartSeries[];
  table: {
    title: string;
    columns: TableColumn[];
    searchFields?: string[];
    recordKey?: string;
    rows: Array<Record<string, unknown>>;
    pagination: ApiPagination;
  };
  filters: Array<{
    key: string;
    label: string;
    options: Array<{ label: string; value: string }>;
  }>;
  widgets: Array<{
    title: string;
    value: string;
    detail: string;
    tone?: "emerald" | "sky" | "amber" | "rose" | "violet";
  }>;
};

export const taskStatuses = ["todo", "in-progress", "blocked", "done"] as const;
export type TaskStatus = typeof taskStatuses[number];
export const taskStatusLabels: Record<TaskStatus, string> = {
  todo: "To do", "in-progress": "In progress", blocked: "Blocked", done: "Done"
};

export function projectSummary(tasks: ReadonlyArray<{ status: unknown; priority: unknown }>) {
  const count = (status: TaskStatus) => tasks.filter((task) => task.status === status).length;
  const blocked = count("blocked");
  const done = count("done");
  return {
    metrics: [
      { label: "Tasks", value: tasks.length, tone: "sky" },
      { label: "Done", value: done, tone: "emerald", drill: { label: "Review completed tasks", params: { status: "done" } } },
      { label: "In progress", value: count("in-progress"), tone: "violet", drill: { label: "Review in-progress tasks", params: { status: "in-progress" } } },
      { label: "Blocked", value: blocked, tone: "rose", drill: { label: "Review blocked tasks", params: { status: "blocked" } } }
    ],
    charts: [
      { name: "Tasks by status", filterKey: "status", type: "bar", xKey: "status", yKeys: ["tasks"],
        data: taskStatuses.map((status) => ({ status: taskStatusLabels[status], tasks: count(status) })) },
      { name: "Priority mix", type: "pie", xKey: "priority", yKeys: ["count"],
        data: ["high", "medium", "low"].map((priority) => ({ priority, count: tasks.filter((task) => task.priority === priority).length })) }
    ],
    widgets: [
      { title: "Completion", value: tasks.length ? Math.round(done / tasks.length * 100) + "%" : "0%",
        detail: done + " of " + tasks.length + " tasks marked done." },
      { title: "Needs attention", value: blocked + " blocked",
        detail: "Review blocked work with the assigned team member." }
    ]
  } satisfies Pick<DashboardResponse, "metrics" | "charts" | "widgets">;
}

export const reportSearchFields: Record<DashboardId, string[]> = {
  analytics: ["customerName", "channel", "status"], ecommerce: ["customerName", "channel", "status"],
  users: ["name", "email"], finance: ["description", "type", "status"],
  inventory: ["product", "sku", "warehouse"], projects: ["title", "project", "assignee"],
  marketing: ["name", "channel"], monitoring: ["message", "service"],
  crm: ["company", "name", "source"], insights: ["title", "summary", "category"]
};

export const invoiceAgeBands = [
  { value: "current", label: "Current", minDays: 0 },
  { value: "1-30", label: "1–30 days", minDays: 1 },
  { value: "31-60", label: "31–60 days", minDays: 31 },
  { value: "61-90", label: "61–90 days", minDays: 61 },
  { value: "91-plus", label: "91+ days", minDays: 91 }
] as const;

export const invoiceAgeFilter = {
  key: "aging", label: "Invoice age",
  options: [{ value: "all", label: "All ages" }, { value: "past-due", label: "All past due" }, ...invoiceAgeBands.map(({ value, label }) => ({ value, label }))]
};

export type EventCounts = { total: number; errors: number; warnings: number; info: number; p95: number | null };

export function monitoringSummary(counts: EventCounts, serviceCount: number, service: string) {
  const { total, errors, warnings, info, p95 } = counts;
  const errorShare = total ? Number((errors * 100 / total).toFixed(1)) : 0;
  return {
    periodLabel: service ? "Event metrics for " + service : "Event metrics across all services",
    metrics: [
      { label: "Log events", value: total, tone: "emerald" },
      { label: "Errors", value: errors, tone: "rose", drill: { label: "Review error events", params: {level: "error"} } },
      { label: "P95 latency", value: p95 == null ? "—" : p95 + " ms", tone: "sky" },
      { label: "Services", value: serviceCount, tone: "violet" }
    ] satisfies DashboardMetric[],
    levels: { name: "Log levels", filterKey: "level", type: "bar", xKey: "level", yKeys: ["count"],
      data: [{ level: "info", count: info }, { level: "warn", count: warnings }, { level: "error", count: errors }] } satisfies ChartSeries,
    widgets: [
      { title: "Error share", value: errorShare + "%", detail: "Error events as a share of the selected service scope." },
      { title: "Latency sample", value: total + (total === 1 ? " event" : " events"), detail: "P95 is the nearest-rank 95th percentile of the selected events." }
    ]
  };
}

export const defaultScenarioChange = 12;

export function scenarioCents(bookedCents: number, changePercent: number) {
  return Math.sign(bookedCents) * Math.round(Math.abs(bookedCents) * (100 + changePercent) / 100);
}
