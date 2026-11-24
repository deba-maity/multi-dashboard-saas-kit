import { useState } from "react";
import { taskStatuses, taskStatusLabels, type DashboardResponse, type TaskStatus } from "@saas-kit/shared";
import { api, ApiError } from "../../lib/api";
import { changeDemoTask, isDemo } from "../../lib/demo";
import { cellText } from "../../lib/format";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function RecordDialog({ data, row, canManage, onClose, onRefresh }: {
  data: DashboardResponse; row: Record<string, unknown>; canManage: boolean;
  onClose: () => void; onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState(String(row.status) as TaskStatus);
  const [previousStatus, setPreviousStatus] = useState(status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const editable = data.id === "projects" && canManage;
  async function save() {
    setSaving(true);
    try {
      if (isDemo) await changeDemoTask(String(row.id), previousStatus, status);
      else await api("/tasks/" + encodeURIComponent(String(row.id)) + "/status", {
        method: "PATCH", body: JSON.stringify({ status, previousStatus })
      });
      await onRefresh();
      onClose();
    } catch (error) {
      const current = error instanceof ApiError && error.status === 409
        ? taskStatuses.find((value) => value === error.details?.currentStatus) : undefined;
      if (current) {
        setPreviousStatus(current);
        setStatus(current);
        setMessage("Another edit moved this task to " + taskStatusLabels[current] + ". Choose a status to update it again.");
      } else {
        setMessage(error instanceof Error ? error.message : "Unable to update task.");
      }
      await onRefresh();
    } finally { setSaving(false); }
  }
  return <Modal open title={data.id === "projects" ? String(row.title) : data.table.title + " record"} onClose={() => { if (!saving) onClose(); }}>
    <dl className="grid gap-3">{data.table.columns.map((column) => <div key={column.key} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-zinc-500">{column.label}</dt><dd className="break-words font-medium">{cellText(column, editable && column.key === "status" ? previousStatus : row[column.key])}</dd>
    </div>)}</dl>
    {editable && <div className="mt-5 grid gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <label className="grid gap-1 text-sm font-semibold">Task status
        <select className="rounded-md border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
          {taskStatuses.map((item) => <option value={item} key={item}>{taskStatusLabels[item]}</option>)}
        </select>
      </label>
      {isDemo && <p className="text-xs text-zinc-500">Sample task changes are saved in this browser.</p>}
      {message && <p role="alert" className="text-sm text-rose-600">{message}</p>}
      <Button disabled={saving || status === previousStatus} onClick={save}>{saving ? "Saving…" : "Save status"}</Button>
    </div>}
  </Modal>;
}
