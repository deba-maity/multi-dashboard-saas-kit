import { useState } from "react";
import { currency, titleCase } from "../../lib/format";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { ChartSeries } from "@saas-kit/shared";

const colors = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444"];

export function ChartCard({ chart, drill }: { chart: ChartSeries; drill?: (category: string) => void }) {
  const [showData, setShowData] = useState(false);
  const formatNumber = (value: number | string) => chart.unit === "USD" ? currency(value) : chart.unit === "ms" ? value + " ms" : Number(value).toLocaleString("en-US");
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
      <XAxis dataKey={chart.xKey} tick={{ fill: "var(--chart-tick)" }} tickLine={false} axisLine={false} fontSize={12} />
      <YAxis tickFormatter={(value: number) => chart.unit === "USD" ? "$" + new Intl.NumberFormat("en-US", { notation: "compact" }).format(value) : value.toLocaleString("en-US")} tick={{ fill: "var(--chart-tick)" }} tickLine={false} axisLine={false} fontSize={12} />
      <Tooltip formatter={(value: number | string) => formatNumber(value)} itemStyle={{ color: "var(--chart-tick)" }} contentStyle={{ borderRadius: 8, backgroundColor: "var(--chart-bg)", color: "var(--chart-tick)", border: "1px solid var(--chart-grid)" }} />
    </>
  );

  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-zinc-950 dark:text-white">{chart.name}</h3>
        <button aria-label={(showData ? "Show chart for " : "View data for ") + chart.name} aria-pressed={showData} onClick={() => setShowData((shown) => !shown)} className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">{showData ? "Chart" : "View data"}</button>
      </div>
      {showData ? <div className="h-56 overflow-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">{chart.name}</caption><thead><tr>{[chart.xKey, ...chart.yKeys].map((key) => <th className="px-2 py-1.5" key={key}>{titleCase(key)}</th>)}</tr></thead>
        <tbody>{chart.data.map((row, i) => <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">{[chart.xKey, ...chart.yKeys].map((key) => <td key={key} className="px-2 py-1.5">{key === chart.xKey ? row[key] : formatNumber(row[key])}</td>)}</tr>)}</tbody>
      </table></div> : !chart.data.length ? <div className="grid h-56 place-items-center text-sm text-zinc-500">No data for this period</div> : <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Line isAnimationActive={false} key={key} type="monotone" dataKey={key} stroke={colors[index]} strokeWidth={2.5} dot={false} />
              ))}
            </LineChart>
          ) : chart.type === "area" ? (
            <AreaChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Area isAnimationActive={false} key={key} type="monotone" dataKey={key} stroke={colors[index]} fill={colors[index]} fillOpacity={0.15} />
              ))}
            </AreaChart>
          ) : chart.type === "pie" ? (
            <PieChart>
              <Tooltip formatter={(value: number | string) => formatNumber(value)} itemStyle={{ color: "var(--chart-tick)" }} contentStyle={{ borderRadius: 8, backgroundColor: "var(--chart-bg)", color: "var(--chart-tick)", border: "1px solid var(--chart-grid)" }} />
              <Pie isAnimationActive={false} data={chart.data} dataKey={chart.yKeys[0]} nameKey={chart.xKey} innerRadius={55} outerRadius={95} paddingAngle={4}>
                {chart.data.map((_, index) => (
                  <Cell key={index} fill={colors[index % colors.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Bar isAnimationActive={false} key={key} dataKey={key} fill={colors[index]} radius={[6, 6, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>}
      {(drill || chart.type === "pie") && chart.data.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
        {chart.data.map((row, index) => {
          const category = String(row[chart.xKey]);
          const marker = <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: colors[chart.type === "pie" ? index % colors.length : 0] }} />;
          return drill ? <button key={category} onClick={() => drill(category)} aria-label={"Show records for " + category} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2 py-1 text-xs font-medium hover:border-emerald-600 dark:border-zinc-700">{marker}{titleCase(category)}</button> :
            <span key={category} className="inline-flex items-center gap-1.5 text-xs">{marker}{titleCase(category)}</span>;
        })}
      </div>}
    </div>
  );
}
