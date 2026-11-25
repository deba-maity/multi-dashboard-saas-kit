import { Download, RotateCcw } from "lucide-react";
import { defaultScenarioChange, scenarioCents, type ChartSeries } from "@saas-kit/shared";
import { currency } from "../../lib/format";
import { downloadWorksheet } from "../../lib/report";
import { Button } from "./Button";
import { ChartCard } from "./ChartCard";

export function RevenueScenario({chart, assumption, onChange, children}: {
  chart: ChartSeries; assumption: string | null; onChange: (value: string) => void; children: React.ReactNode;
}) {
  const change = assumption !== null && /^-?\d{1,3}$/.test(assumption) && Math.abs(Number(assumption)) <= 100
    ? Number(assumption) : defaultScenarioChange;
  const signed = (value: number) => value > 0 ? "+" + value : String(value);
  let bookedCents = 0, projectedCents = 0;
  const points = chart.data.map((row) => {
    const cents = Math.round(Number(row.booked) * 100);
    const projected = scenarioCents(cents, change);
    bookedCents += cents;
    projectedCents += projected;
    return { month: String(row.month), booked: cents / 100, scenario: projected / 100 };
  });
  const difference = projectedCents - bookedCents;
  function exportScenario() {
    downloadWorksheet([["Month", "Booked revenue (USD)", "Scenario change (%)", "Scenario revenue (USD)"],
      ...points.map((row) => [row.month, row.booked, change, row.scenario])], "revenue-scenario");
  }
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2">
    {children}
    <section id="revenue-scenario" tabIndex={-1} aria-label={chart.name} className="min-w-0 scroll-mt-20"><ChartCard chart={{ ...chart, data: points }} /></section>
    {points.length > 0 && <div className="grid min-w-0 gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-2 xl:col-span-2">
      <div className="grid min-w-0 content-start gap-2"><div className="flex items-center justify-between gap-3">
        <label htmlFor="revenue-change" className="text-sm font-semibold">Change from booked revenue</label>
        <output htmlFor="revenue-change" className="rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{signed(change)}%</output>
      </div>
      <input id="revenue-change" type="range" min="-100" max="100" step="1" value={change} aria-valuetext={signed(change) + " percent"}
        className="h-5 w-full cursor-pointer accent-emerald-700" onChange={(e) => onChange(Number(e.target.value) === defaultScenarioChange ? "" : e.target.value)} />
      <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">Applies to paid and shipped orders in each recorded month.</p></div>
      <div className="grid min-w-0 gap-2"><dl className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
        {[["Booked", currency(bookedCents / 100)], ["Scenario", currency(projectedCents / 100)],
          ["Difference", (difference > 0 ? "+" : "") + currency(difference / 100)]].map(([label, value]) =>
          <div key={label} className="min-w-0"><dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
            <dd className="mt-1 break-words font-semibold tabular-nums sm:text-sm">{value}</dd></div>)}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={exportScenario}><Download size={14} />Export scenario CSV</Button>
        {change !== defaultScenarioChange && <Button size="sm" variant="ghost" onClick={() => onChange("")}><RotateCcw size={14} />Reset to +{defaultScenarioChange}%</Button>}
      </div></div>
    </div>}
  </div>;
}
