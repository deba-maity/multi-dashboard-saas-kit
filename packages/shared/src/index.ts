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
  type?: "text" | "number" | "currency" | "date" | "status" | "percent";
};

export type DashboardMetric = {
  label: string;
  value: string | number;
  change?: number;
  tone?: "emerald" | "sky" | "amber" | "rose" | "violet";
};

export type ChartSeries = {
  name: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKeys: string[];
  type: "line" | "bar" | "area" | "pie";
};

export type DashboardResponse = {
  id: DashboardId;
  title: string;
  description: string;
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
