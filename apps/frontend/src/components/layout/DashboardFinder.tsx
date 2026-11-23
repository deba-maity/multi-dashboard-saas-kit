import { useEffect, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { dashboards } from "../../lib/dashboards";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

const keywords = {
  analytics: "revenue growth orders", ecommerce: "orders shipping sales fulfillment",
  users: "team people directory members", finance: "payments invoice transactions billing",
  inventory: "stock products reorder warehouse", projects: "tasks blocked board delivery",
  marketing: "campaign clicks spend", monitoring: "logs errors latency services",
  crm: "leads deals forecast pipeline", insights: "recommendations scoring scenario"
};

export function DashboardFinder() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch("");
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const matches = dashboards.filter(({ id, label }) => (label + " " + keywords[id]).toLowerCase().includes(search.trim().toLowerCase()));
  const select = (id: string) => { setOpen(false); navigate("/dashboards/" + id); };
  return <>
    <button onClick={() => { setSearch(""); setOpen(true); }} aria-label="Find dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300">
      <Search size={16} /><span className="hidden sm:inline">Find dashboard</span>
      <kbd className="ml-6 hidden text-xs text-zinc-500 md:inline">Ctrl / ⌘ K</kbd>
    </button>
    <Modal open={open} title="Find a dashboard" onClose={() => setOpen(false)}>
      <Input autoFocus aria-label="Find by name or topic" placeholder="Search by name or topic" value={search}
        onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches.length) select(matches[0].id); }} />
      <div className="mt-3 grid max-h-[45vh] overflow-auto">
        {matches.map(({ id, icon: Icon, label }) => <button key={id} onClick={() => select(id)} className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800">
          <Icon size={16} /><span className="flex-1">{label}</span><ArrowUpRight size={14} />
        </button>)}
        {!matches.length && <p className="py-4 text-sm text-zinc-500">No matching dashboards.</p>}
      </div>
    </Modal>
  </>;
}
