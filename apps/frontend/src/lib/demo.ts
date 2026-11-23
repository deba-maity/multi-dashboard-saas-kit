import { projectSummary, reportSearchFields, taskStatuses, type DashboardId, type DashboardResponse, type TaskStatus } from "@saas-kit/shared";

export const isDemo = import.meta.env.MODE === "pages-demo";

const snapshots = new Map<string, Promise<DashboardResponse>>();
function snapshot(id: DashboardId, period?: string | null): Promise<DashboardResponse> {
  const name = id === "analytics" && (period === "30" || period === "90") ? id + "-" + period : id;
  const cached = snapshots.get(name);
  if (cached) return cached;
  const pending = fetch(import.meta.env.BASE_URL + "demo/" + name + ".json")
    .then((response) => {
      if (!response.ok) throw new Error("Unable to load the sample data. Try refreshing.");
      return response.json() as Promise<DashboardResponse>;
    })
    .catch((error) => { snapshots.delete(name); throw error; });
  snapshots.set(name, pending);
  return pending;
}

const taskKey = (id: string) => "northstar.sample.task." + id;

function savedStatus(id: string) {
  const value = localStorage.getItem(taskKey(id));
  return taskStatuses.find((status) => status === value);
}

export async function changeDemoTask(id: string, previousStatus: string, status: TaskStatus) {
  const data = await snapshot("projects");
  const task = data.table.rows.find((row) => row.id === id);
  if (!task) throw new Error("Task no longer exists in this sample.");
  const current = savedStatus(id) ?? task.status;
  if (current !== previousStatus && current !== status) throw new Error("This task changed. Reopen it to see the current status.");
  if (status === task.status) localStorage.removeItem(taskKey(id));
  else localStorage.setItem(taskKey(id), status);
}

export async function resetDemoTasks() {
  const data = await snapshot("projects");
  for (const task of data.table.rows) localStorage.removeItem(taskKey(String(task.id)));
}

export async function loadDemoDashboard(id: DashboardId, query: string): Promise<DashboardResponse> {
  const params = new URLSearchParams(query);
  const original = await snapshot(id, params.get("period"));
  const data = { ...original, table: { ...original.table } };
  if (id === "projects") {
    const tasks = data.table.rows.map((row) => ({
      ...row, status: savedStatus(String(row.id)) ?? row.status, priority: row.priority
    }));
    data.table.rows = tasks;
    Object.assign(data, projectSummary(tasks));
  }
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize")) || 10));
  const rows = data.table.rows.filter((row) =>
    data.filters.every(({ key }) => {
      const value = params.get(key);
      return !value || value === "all" || String(row[key]).toLowerCase() === value.toLowerCase();
    }) && (!search || reportSearchFields[id].some((key) =>
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
      if (left == null || right == null) order = Number(left == null) - Number(right == null);
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
