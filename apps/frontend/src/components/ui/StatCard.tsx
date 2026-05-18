import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { clsx } from "clsx";
import type { DashboardMetric } from "@saas-kit/shared";
import { compact, currency } from "../../lib/format";

const toneClasses: Record<string, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500"
};

const formatValue = (metric: DashboardMetric) => {
  if (typeof metric.value === "number" && metric.label.toLowerCase().includes("revenue")) return currency(metric.value);
  if (typeof metric.value === "number" && metric.value > 9999) return compact(metric.value);
  return metric.value;
};

export function StatCard({ metric }: { metric: DashboardMetric }) {
  const positive = Number(metric.change ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{metric.label}</p>
          <p className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">{formatValue(metric)}</p>
        </div>
        <span className={clsx("h-9 w-1.5 rounded-full", toneClasses[metric.tone ?? "sky"])} />
      </div>
      {metric.change !== undefined ? (
        <div className={clsx("mt-4 inline-flex items-center gap-1 text-sm font-semibold", positive ? "text-emerald-600" : "text-rose-600")}>
          {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {Math.abs(metric.change)}%
        </div>
      ) : null}
    </div>
  );
}
