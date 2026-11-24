import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { downloadWorksheet, loadReport } from "../../lib/report";
import { Button } from "./Button";
import { FormField } from "./FormField";
import { Modal } from "./Modal";

export function ReorderPlan({ scope, onClose }: { scope: string; onClose: () => void }) {
  const [buffer, setBuffer] = useState("5");
  const [warehouse, setWarehouse] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reorder-plan", scope],
    queryFn: async () => {
      const params = new URLSearchParams({ status: "low", pageSize: "50", sort: "sku" });
      const first = (await loadReport("inventory", params)).table;
      const rows = [...first.rows];
      for (let page = 2; page <= first.pagination.pageCount; page++) {
        params.set("page", String(page));
        rows.push(...(await loadReport("inventory", params)).table.rows);
      }
      return rows;
    }
  });
  const valid = /^\d+$/.test(buffer) && Number(buffer) > 0 && Number(buffer) <= 10000;
  const rows = (data ?? []).filter((row) => !warehouse || row.warehouse === warehouse);
  const orderUnits = (row: Record<string, unknown>) => Math.max(0, Number(row.reorderPoint) + Number(buffer) - Number(row.stock));
  function download() {
    downloadWorksheet([["SKU", "Warehouse", "On hand", "Reorder point", "Target", "Order units"],
      ...rows.map((r) => [String(r.sku), String(r.warehouse), Number(r.stock), Number(r.reorderPoint), Number(r.reorderPoint) + Number(buffer), orderUnits(r)])]);
  }
  return <Modal open title="Plan a reorder" onClose={onClose}>
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Calculate a draft order for items at or below their reorder point. Set the extra stock you want on hand after delivery.</p>
      <FormField type="number" min="1" max="10000" step="1" label="Extra units per SKU" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
      {!valid && <p role="alert" className="text-sm text-rose-600">Choose a whole number from 1 to 10,000.</p>}
      <div className="grid min-w-0 gap-1 text-sm font-semibold">
        <label htmlFor="reorder-warehouse">Warehouse</label>
        <select id="reorder-warehouse" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="rounded border bg-white p-2 dark:bg-zinc-950">
          <option value="">All warehouses</option>
          {[...new Set((data ?? []).map((r) => String(r.warehouse)))].sort().map((name) => <option key={name}>{name}</option>)}
        </select>
      </div>
      {isLoading && <p role="status">Loading low-stock items…</p>}
      {error && <Button onClick={() => refetch()}>Retry loading inventory</Button>}
      {data && !rows.length && <p role="status">This warehouse selection has no stock at or below its reorder point.</p>}
      {data && rows.length > 0 && valid && <><div className="max-h-[30vh] overflow-auto">
        <table className="w-full text-left text-sm"><caption className="sr-only">Draft reorder quantities</caption>
          <thead><tr>{["SKU", "Warehouse", "On hand", "Target", "Order"].map((h) => <th className="p-1" key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr className="border-t dark:border-zinc-700" key={String(r.id)}>
            <td className="p-1">{String(r.sku)}</td><td className="p-1">{String(r.warehouse)}</td><td>{Number(r.stock)}</td><td>{Number(r.reorderPoint) + Number(buffer)}</td><td>{orderUnits(r)}</td>
          </tr>)}</tbody>
        </table>
      </div><p aria-live="polite" className="font-semibold">{rows.reduce((sum, r) => sum + orderUnits(r), 0)} units across {rows.length} stock {rows.length === 1 ? "item" : "items"}</p></>}
      <Button onClick={download} disabled={!data || !rows.length || !valid}>Download draft CSV</Button>
    </div>
  </Modal>;
}
