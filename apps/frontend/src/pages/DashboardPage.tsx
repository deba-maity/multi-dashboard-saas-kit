import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import type { DashboardId, DashboardResponse } from "@saas-kit/shared";
import { api } from "../lib/api";
import { dashboards } from "../lib/dashboards";
import { Button } from "../components/ui/Button";
import { ChartCard } from "../components/ui/ChartCard";
import { DataTable } from "../components/ui/DataTable";
import { Dropdown } from "../components/ui/Dropdown";
import { Modal } from "../components/ui/Modal";
import { StatCard } from "../components/ui/StatCard";
import { FormField } from "../components/ui/FormField";
import { useToast } from "../providers/ToastProvider";

const isDashboard = (value?: string): value is DashboardId =>
  dashboards.some((dashboard) => dashboard.id === value);

export function DashboardPage() {
  const params = useParams();
  const dashboardId: DashboardId = isDashboard(params.dashboardId) ? params.dashboardId : "analytics";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Record<string, string>>({});
  const selected = dashboards.find((dashboard) => dashboard.id === dashboardId)!;
  const SelectedIcon = selected.icon;
  const queryClient = useQueryClient();

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10", search });
    Object.entries(filter).forEach(([key, value]) => params.set(key, value));
    return params.toString();
  }, [page, search, filter]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["dashboard", dashboardId, queryString],
    queryFn: () => api<DashboardResponse>(`/dashboard-data/${dashboardId}?${queryString}`)
  });

  if (isLoading) {
    return <div className="grid min-h-[60vh] place-items-center text-sm font-semibold text-zinc-500">Loading dashboard...</div>;
  }

  if (error || !data) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error instanceof Error ? error.message : "Unable to load dashboard"}</div>;
  }

  return (
    <div className="grid gap-6">
      <div className={`rounded-lg bg-gradient-to-r ${selected.accent} p-5 text-white shadow-soft`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
              <SelectedIcon className="h-4 w-4" />
              {selected.label}
            </div>
            <h1 className="text-3xl font-bold tracking-normal">{data.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/85">{data.description}</p>
          </div>
          <Button variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ["dashboard", dashboardId] })}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <StatCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {data.filters.map((item) => (
          <Dropdown
            key={item.key}
            label={item.label}
            value={filter[item.key] ?? item.options[0]?.value ?? "all"}
            options={item.options.map((option) => ({ ...option, label: option.label[0].toUpperCase() + option.label.slice(1) }))}
            onChange={(value) => {
              setPage(1);
              setFilter((current) => ({ ...current, [item.key]: value }));
            }}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.charts.map((chart) => (
          <ChartCard key={chart.name} chart={chart} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.widgets.map((widget) => (
          <div key={widget.title} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{widget.title}</p>
            <p className="mt-2 text-xl font-bold text-zinc-950 dark:text-white">{widget.value}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{widget.detail}</p>
          </div>
        ))}
      </div>

      <DataTable
        title={data.table.title}
        columns={data.table.columns}
        rows={data.table.rows}
        pagination={data.table.pagination}
        search={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        onPageChange={setPage}
      />

      {dashboardId === "users" ? <UserCrudPanel /> : null}
    </div>
  );
}

function UserCrudPanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "Password123!", role: "MEMBER" });
  const queryClient = useQueryClient();
  const toast = useToast();

  const invite = async () => {
    await api("/users", { method: "POST", body: JSON.stringify(form) });
    toast.push({ title: "User invited", message: `${form.email} was added to the organization.` });
    setOpen(false);
    setForm({ name: "", email: "", password: "Password123!", role: "MEMBER" });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "users"] });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-zinc-950 dark:text-white">User CRUD workspace</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Create members through the protected admin API. Edit and remove flows use the same /users module.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite user
        </Button>
      </div>
      <Modal open={open} title="Invite team member" onClose={() => setOpen(false)}>
        <div className="grid gap-4">
          <FormField label="Name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <FormField label="Email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          <FormField label="Temporary password" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
          <Dropdown
            label="Role"
            value={form.role}
            options={[
              { label: "Member", value: "MEMBER" },
              { label: "Admin", value: "ADMIN" }
            ]}
            onChange={(role) => setForm((current) => ({ ...current, role }))}
          />
          <Button onClick={invite}>Create member</Button>
        </div>
      </Modal>
    </div>
  );
}
