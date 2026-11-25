import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DashboardId } from "@saas-kit/shared";
import { dashboards } from "../../lib/dashboards";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

const keywords: Record<DashboardId, string> = {
  analytics: "revenue growth orders", ecommerce: "orders shipping sales fulfillment",
  users: "team people directory members", finance: "payments invoice transactions billing",
  inventory: "stock products reorder warehouse", projects: "tasks blocked board delivery",
  marketing: "campaign clicks spend", monitoring: "logs errors latency services",
  crm: "leads deals forecast pipeline", insights: "recommendations scoring scenario"
};
const workspaces = dashboards.map(({id, label, icon}) => ({id, label, icon, query: "", keywords: keywords[id]}));
const reports: Array<{id: DashboardId; label: string; keywords: string; query: string}> = [
  {id: "finance", label: "Past-due invoices", keywords: "overdue unpaid aging outstanding payments collections", query: "?ledger=invoices&aging=past-due&view=records"},
  {id: "projects", label: "Blocked tasks", keywords: "blocked project work", query: "?status=blocked&view=records"},
  {id: "projects", label: "Task board", keywords: "kanban tasks project delivery", query: "?layout=board"},
  {id: "inventory", label: "Low-stock items", keywords: "low stock reorder inventory warehouse", query: "?status=low&view=records"},
  {id: "monitoring", label: "Service errors", keywords: "errors logs incidents monitoring", query: "?level=error&view=records"},
  {id: "marketing", label: "Campaign returns", keywords: "marketing acquisition roi spend return on investment", query: "?sort=roi&direction=desc&view=records"},
  {id: "insights", label: "Booked revenue scenario", keywords: "revenue forecast scenario what if simulation", query: "?view=scenario"}
];
const destinations = [...workspaces, ...reports.map((report) => ({...report, icon: dashboards.find((d) => d.id === report.id)!.icon}))];
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function DashboardFinder() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const resultsId = useId();
  const list = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  function toggle() {
    setSearch("");
    setActive(0);
    setOpen((current) => !current);
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (!open && document.querySelector("dialog[open]")) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open]);
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({block: "nearest"});
  }, [active, search, open]);
  const query = words(search);
  const matches = query ? destinations.filter((item) => {
    const text = words(item.label + " " + item.keywords);
    return query.split(" ").every((word) => text.includes(word));
  }).sort((a, b) => Number(words(b.label).includes(query)) - Number(words(a.label).includes(query))) : workspaces;
  const select = (index: number) => {
    const match = matches[index];
    if (match) { setOpen(false); navigate("/dashboards/" + match.id + match.query); }
  };
  return <>
    <button onClick={toggle} aria-label="Find dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300">
      <Search size={16} /><span className="hidden sm:inline">Find dashboard</span>
      <kbd className="ml-6 hidden text-xs text-zinc-500 md:inline">Ctrl / ⌘ K</kbd>
    </button>
    <Modal open={open} title="Find a dashboard" onClose={() => setOpen(false)}>
      <Input autoFocus role="combobox" aria-expanded={open} aria-controls={resultsId} aria-autocomplete="list"
        aria-activedescendant={matches.length ? resultsId + "-" + active : undefined}
        aria-label="Find by name or topic" placeholder="Search dashboards and reports" value={search}
        onChange={(e) => { setSearch(e.target.value); setActive(0); }} onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || !matches.length) return;
          if (e.key === "Enter") { e.preventDefault(); select(active); }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((current) => (current + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
          }
        }} />
      <div id={resultsId} ref={list} role="listbox" aria-label="Matching dashboards and reports" className="mt-3 grid max-h-[45vh] overflow-auto">
        {matches.map(({ id, query, icon: Icon, label }, index) => <button type="button" role="option" tabIndex={-1} id={resultsId + "-" + index}
          aria-selected={active === index} key={id + query} onClick={() => select(index)}
          className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-zinc-100 aria-selected:bg-emerald-50 dark:hover:bg-zinc-800 dark:aria-selected:bg-emerald-950">
          <Icon size={16} /><span className="flex-1">{label}</span><ArrowUpRight size={14} />
        </button>)}
      </div>
      {!matches.length && <p role="status" className="py-4 text-sm text-zinc-500">No matching dashboards or reports.</p>}
    </Modal>
  </>;
}
