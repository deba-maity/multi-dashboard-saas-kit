import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
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
  if (metric.format === "currency") return currency(metric.value);
  if (typeof metric.value === "number" && metric.value > 9999) return compact(metric.value);
  return metric.value;
};

export function StatCard({ metric, onDrill }: { metric: DashboardMetric; onDrill?: () => void }) {
  const Card = onDrill ? "button" : "div";
  const positive = Number(metric.change ?? 0) >= 0;
  return (
    <Card onClick={onDrill} aria-label={onDrill ? metric.drill?.label : undefined}
      className={clsx("min-w-0 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        onDrill && "group hover:border-emerald-600 focus-visible:border-emerald-600 dark:hover:border-emerald-400")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{metric.label}</p>
          <p className="mt-2 break-words text-xl tabular-nums sm:text-2xl font-bold text-zinc-950 dark:text-white">{formatValue(metric)}</p>
        </div>
        {onDrill ? <ChevronRight aria-hidden="true" size={17} className="shrink-0 text-zinc-500 group-hover:text-emerald-700 dark:group-hover:text-emerald-400" /> :
          <span className={clsx("h-7 w-1 shrink-0 rounded-full", toneClasses[metric.tone ?? "sky"])} />}
      </div>
      {metric.change !== undefined ? (
        <div className={clsx("mt-4 inline-flex items-center gap-1 text-sm font-semibold", positive ? "text-emerald-600" : "text-rose-600")}>
          {metric.change === 0 ? null : positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {positive && metric.change !== 0 ? "+" : ""}{metric.change}%
        </div>
      ) : null}
    </Card>
  );
}
