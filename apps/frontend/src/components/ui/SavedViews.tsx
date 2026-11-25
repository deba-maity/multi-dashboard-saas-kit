import { useEffect, useState } from "react";
import { Bookmark, Link2, X } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useToast } from "../../providers/ToastProvider";
import { Button } from "./Button";
import { FormField } from "./FormField";
import { Modal } from "./Modal";

import { readBrowserRecord, writeBrowserRecord, withBrowserLock } from "../../lib/browser-records";

type View = { name: string; query: string };
function readViews(key: string): View[] {
  try {
    const value: unknown = JSON.parse(readBrowserRecord(key) ?? "[]");
    return Array.isArray(value) ? value.filter((v) => v && typeof v.name === "string" && typeof v.query === "string") : [];
  } catch { return []; }
}

export function SavedViews({ dashboard, scope }: { dashboard: string; scope: string }) {
  const key = "northstar.views." + scope + "." + dashboard;
  const [views, setViews] = useState(() => readViews(key));
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setViews(readViews(key));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const [name, setName] = useState("");
  const [dialog, setDialog] = useState(false);
  const [manualLink, setManualLink] = useState("");
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const toast = useToast();
  const view = new URLSearchParams(params);
  if (view.get("layout") === "board") view.delete("view");
  else view.set("view", "records");
  async function update(change: (list: View[]) => View[]) {
    const { list, persisted } = await withBrowserLock(key, () => {
      const list = change(readViews(key));
      return { list, persisted: writeBrowserRecord(key, JSON.stringify(list)) };
    });
    setViews(list);
    if (!persisted) toast.push({ title: "Views updated for this tab", message: "Storage is unavailable. These changes last until you reload or close the page." });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) return;
    await update((list) => [...list.filter((v) => v.name.toLowerCase() !== label.toLowerCase()), { name: label, query: view.toString() }]);
    setDialog(false);
    setName("");
  }
  async function copy() {
    const url = new URL(window.location.href);
    if (url.hash.startsWith("#/")) url.hash = pathname + "?" + view;
    else url.search = view.toString();
    try { await navigator.clipboard.writeText(url.href); toast.push({ title: "Report link copied" }); }
    catch { setManualLink(url.href); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" variant="secondary" onClick={() => setDialog(true)}><Bookmark size={14} />Save view</Button>
    <Button size="sm" variant="secondary" onClick={copy}><Link2 size={14} />Copy link</Button>
    {views.map((v) => <span key={v.name} className="inline-flex min-w-0 max-w-full items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      <button className="min-w-0 p-1 text-left [overflow-wrap:anywhere]" onClick={() => setParams(new URLSearchParams(v.query))}>{v.name}</button>
      <button className="shrink-0 rounded-full p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900" aria-label={"Remove saved view " + v.name}
        onClick={() => void update((list) => list.filter((item) => item.name !== v.name))}><X size={13} /></button>
    </span>)}
    <Modal open={dialog} title="Save report view" onClose={() => setDialog(false)}>
      <form className="grid gap-3" onSubmit={save}>
        <FormField autoFocus required maxLength={40} label="View name" placeholder="e.g. Pending orders" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-zinc-500">Stores this report and its filters in your browser. An existing name updates that view.</p>
        <Button disabled={!name.trim()} type="submit">Save report view</Button>
      </form>
    </Modal>
    <Modal open={!!manualLink} title="Copy report link" onClose={() => setManualLink("")}>
      <FormField autoFocus readOnly label="Report URL" value={manualLink} onFocus={(e) => e.target.select()} />
    </Modal>
  </div>;
}
