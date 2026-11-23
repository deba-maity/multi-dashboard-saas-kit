import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus, RotateCcw } from "lucide-react";
import type { DashboardId } from "@saas-kit/shared";
import { api } from "../lib/api";
import { isDemo, resetDemoTasks } from "../lib/demo";
import { loadReport, downloadReport } from "../lib/report";
import { dashboards } from "../lib/dashboards";
import { Button } from "../components/ui/Button";
import { ChartCard } from "../components/ui/ChartCard";
import { SavedViews } from "../components/ui/SavedViews";
import { DataTable } from "../components/ui/DataTable";
import { RecordDialog } from "../components/ui/RecordDialog";
import { Modal } from "../components/ui/Modal";
import { StatCard } from "../components/ui/StatCard";
import { FormField } from "../components/ui/FormField";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";

export function DashboardPage() {
  const route = useParams();
  const dashboardId: DashboardId = dashboards.find((item) => item.id === route.dashboardId)?.id ?? "analytics";
  const { session } = useAuth();
  const scope = isDemo ? "sample" : [session?.organization?.id, session?.user.id, session?.user.role].join("/");
  const client = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const focusTable = params.get("view") === "records";
  const scrolled = useRef(false);
  const search = params.get("search") ?? "";
  const [settledSearch, setSettledSearch] = useState(search);
  useEffect(() => {
    const pending = window.setTimeout(() => setSettledSearch(search), 180);
    return () => window.clearTimeout(pending);
  }, [search]);
  const query = new URLSearchParams(params);
  if (settledSearch) query.set("search", settledSearch);
  else query.delete("search");
  query.delete("view");
  query.set("pageSize", "10");
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get("page"))) || 1));
  query.set("page", String(page));
  const { data, error, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ["dashboard", dashboardId, scope, query.toString()],
    queryFn: () => loadReport(dashboardId, query),
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === scope ? previous : undefined
  });
  const ready = !!data;
  useEffect(() => {
    if (!focusTable) window.scrollTo(0, 0);
  }, [dashboardId, focusTable]);
  useEffect(() => {
    document.title = (data?.title ?? "Dashboard") + " · Northstar";
    if (ready && focusTable && !scrolled.current) {
      document.getElementById("report-table")?.scrollIntoView({ block: "start" });
      scrolled.current = true;
    }
    if (!focusTable) scrolled.current = false;
  }, [ready, focusTable, data?.title]);
  useEffect(() => {
    if (!data || isPlaceholderData || page <= data.table.pagination.pageCount) return;
    const fixed = new URLSearchParams(params);
    fixed.set("page", String(data.table.pagination.pageCount));
    setParams(fixed, { replace: true, preventScrollReset: true });
  }, [page, data, isPlaceholderData, params, setParams]);
  useEffect(() => {
    if (!isDemo || dashboardId !== "projects") return;
    const sync = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("northstar.sample.task.")) void client.invalidateQueries({ queryKey: ["dashboard", "projects"] });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [dashboardId, client]);
  function change(values: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (!value || (key === "page" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace, preventScrollReset: true });
  }
  async function refresh() { await client.invalidateQueries({ queryKey: ["dashboard", dashboardId, scope] }); }
  async function reset() {
    setResetting(true);
    try {
      await resetDemoTasks();
      await refresh();
      toast.push({ title: "Sample task statuses restored" });
    } catch { toast.push({ title: "Could not reset sample tasks" }); }
    finally { setResetting(false); }
  }
  async function exportCsv() {
    setExporting(true);
    try { await downloadReport(dashboardId, query); }
    catch { toast.push({ title: "Export failed", message: "Please try again." }); }
    finally { setExporting(false); }
  }
  if (error) return <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-4">
    <p>{error instanceof Error ? error.message : "Unable to load dashboard."}</p><Button onClick={() => refetch()}>Retry</Button></div>;
  if (!data) return <p role="status" className="py-12 text-zinc-500">Loading report…</p>;
  const queues = [
    { label: "Review pending orders", to: "ecommerce?status=pending" },
    { label: "Review blocked tasks", to: "projects?status=blocked" },
    { label: "Inspect service errors", to: "monitoring?level=error" }
  ];
  return <div className="grid min-w-0 gap-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>{isDemo && <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">Northstar Labs · Sample workspace</p>}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{data.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">{data.description}</p></div>
      {dashboardId === "projects" && isDemo && <Button variant="secondary" size="sm" disabled={resetting} onClick={reset}><RotateCcw size={14} />Reset sample tasks</Button>}
    </header>
    {dashboardId === "analytics" && <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="Reporting period" className="inline-flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-950">
        {[["", "All time"], ["30", "30 days"], ["90", "90 days"]].map(([period, label]) =>
          <button key={label} aria-pressed={(params.get("period") ?? "") === period} onClick={() => change({ period, page: "" })} className="rounded-md px-3 py-1.5 text-sm font-semibold aria-pressed:bg-emerald-800 aria-pressed:text-white">{label}</button>)}
      </div><p className="text-xs text-zinc-500 dark:text-zinc-400">{data.periodLabel}{params.get("period") && " · vs previous period"}</p>
    </div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{data.metrics.map((metric) => <StatCard key={metric.label} metric={metric} />)}</div>
    {dashboardId === "analytics" && <nav aria-label="Review queues" className="flex flex-wrap gap-2">
      {queues.map(({ label, to }) => <Link key={to} to={"/dashboards/" + to + "&view=records"} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{label}<ArrowUpRight size={14} /></Link>)}
    </nav>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">{data.charts.map((chart) => {
      const filter = data.filters.find(({ key }) => chart.filterKey === key);
      function drill(category: string) {
        if (!filter) return;
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const option = filter.options.find((item) => normalize(item.value) === normalize(category));
        if (!option) return;
        change({ [filter.key]: option.value, page: "", search: "", view: "records" });
        document.getElementById("report-table")?.scrollIntoView({ block: "start" });
      }
      return <ChartCard key={chart.name} chart={chart} drill={filter ? drill : undefined} />;
    })}</div>
    <DataTable data={data} actions={<SavedViews key={scope + dashboardId} scope={scope} dashboard={dashboardId} />} params={params} change={change} onOpen={setRow} onExport={exportCsv} exporting={exporting} fetching={isFetching || settledSearch !== search} />
    <div className="grid gap-3 sm:grid-cols-2">{data.widgets.map((widget) => <article key={widget.title} className="border-l-2 border-emerald-500 px-4">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{widget.title}</h2><p className="mt-1 font-semibold">{widget.value}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{widget.detail}</p></article>)}</div>
    {row && <RecordDialog data={data} row={row} canManage={isDemo || session?.user.role === "ADMIN"} onClose={() => setRow(null)} onRefresh={refresh} />}
    {dashboardId === "users" && !isDemo && session?.user.role === "ADMIN" && <UserCrudPanel />}
  </div>;
}

function UserCrudPanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "MEMBER" });
  const queryClient = useQueryClient();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/users", { method: "POST", body: JSON.stringify(form) });
      toast.push({ title: "Member added", message: `${form.email} was added to the organization.` });
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "MEMBER" });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "users"] });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create member.");
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-zinc-950 dark:text-white">Team access</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Add a team member and choose their access role.</p>
        </div>
        <Button onClick={() => { setError(""); setOpen(true); }}>
          <Plus className="h-4 w-4" />
          Add member
        </Button>
      </div>
      <Modal open={open} title="Add team member" onClose={() => { if (!saving) setOpen(false); }}>
        <form onSubmit={invite} className="grid gap-4">
          <FormField required minLength={2} label="Name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <FormField required label="Email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          <FormField required minLength={8} autoComplete="new-password" label="Initial password" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
          <label className="grid gap-1 text-sm font-semibold">Role<select className="rounded border bg-white p-2 dark:bg-zinc-950" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></select></label>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create member"}</Button>
        </form>
      </Modal>
    </div>
  );
}
