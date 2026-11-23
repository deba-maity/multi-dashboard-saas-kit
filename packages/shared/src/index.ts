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
  type?: "datetime" | "text" | "number" | "currency" | "date" | "status" | "percent";
};

export type DashboardMetric = {
  label: string;
  value: string | number;
  change?: number;
  format?: "currency";
  tone?: "emerald" | "sky" | "amber" | "rose" | "violet";
};

export type ChartSeries = {
  name: string;
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
      { label: "Done", value: done, tone: "emerald" },
      { label: "In progress", value: count("in-progress"), tone: "violet" },
      { label: "Blocked", value: blocked, tone: "rose" }
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
