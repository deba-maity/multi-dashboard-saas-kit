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
  const emptyPie = chart.type === "pie" && chart.data.every((row) => Number(row[chart.yKeys[0]]) === 0);
  const seriesLabel = (key: string) => key === "p95" ? "P95" : titleCase(key);
  const limitServices = chart.filterKey === "service" && chart.data.length > 8;
  const visualData = limitServices ? [...chart.data].sort((a, b) => Number(b.p95) - Number(a.p95) || String(a.service).localeCompare(String(b.service))).slice(0, 8) : chart.data;
  const selectMark = drill ? (_entry: unknown, index: number) => {
    const row = visualData[index];
    if (row) drill(String(row[chart.xKey]));
  } : undefined;
  const singlePoint = chart.data.length === 1;
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
      {!chart.data.length || (emptyPie && !showData) ? <div className="grid h-56 place-items-center text-sm text-zinc-500">No data for this period</div> : showData ? <div className="h-56 overflow-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">{chart.name}</caption><thead><tr>{[chart.xKey, ...chart.yKeys].map((key) => <th className="px-2 py-1.5" key={key}>{seriesLabel(key)}</th>)}</tr></thead>
        <tbody>{chart.data.map((row, i) => <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">{[chart.xKey, ...chart.yKeys].map((key) => <td key={key} className="px-2 py-1.5">{key === chart.xKey && drill ? <button onClick={() => drill(String(row[key]))} aria-label={"Show records for " + row[key]} className="text-left font-medium text-emerald-800 underline underline-offset-2 dark:text-emerald-300">{row[key]}</button> : key === chart.xKey ? row[key] : formatNumber(row[key])}</td>)}</tr>)}</tbody>
      </table></div> : <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Line isAnimationActive={false} key={key} type="monotone" dataKey={key} name={seriesLabel(key)} stroke={colors[index]} strokeWidth={2.5} dot={singlePoint ? { r: 4, fill: colors[index] } : false} />
              ))}
            </LineChart>
          ) : chart.type === "area" ? (
            <AreaChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Area isAnimationActive={false} key={key} type="monotone" dataKey={key} name={seriesLabel(key)} stroke={colors[index]} fill={colors[index]} fillOpacity={0.15} dot={singlePoint ? { r: 4, fill: colors[index] } : false} />
              ))}
            </AreaChart>
          ) : chart.type === "pie" ? (
            <PieChart>
              <Tooltip formatter={(value: number | string) => formatNumber(value)} itemStyle={{ color: "var(--chart-tick)" }} contentStyle={{ borderRadius: 8, backgroundColor: "var(--chart-bg)", color: "var(--chart-tick)", border: "1px solid var(--chart-grid)" }} />
              <Pie isAnimationActive={false} onClick={selectMark} cursor={drill ? "pointer" : undefined} data={visualData} dataKey={chart.yKeys[0]} nameKey={chart.xKey} innerRadius={55} outerRadius={95} paddingAngle={4}>
                {chart.data.map((_, index) => (
                  <Cell key={index} fill={colors[index % colors.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={visualData}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Bar isAnimationActive={false} onClick={selectMark} cursor={drill ? "pointer" : undefined} key={key} dataKey={key} name={seriesLabel(key)} fill={colors[index]} radius={[6, 6, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>}
      {!showData && chart.yKeys.length > 1 && <div aria-label="Chart series" className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-300">
        {chart.yKeys.map((key, index) => <span key={key} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{backgroundColor: colors[index % colors.length]}} />{seriesLabel(key)}</span>)}
      </div>}
      {limitServices && !showData && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Showing the 8 highest P95 values across {chart.data.length} services. View data includes every service.</p>}
      {(!showData || !drill) && (drill || chart.type === "pie") && visualData.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
        {visualData.map((row, index) => {
          const category = String(row[chart.xKey]);
          const marker = <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: colors[chart.type === "pie" ? index % colors.length : 0] }} />;
          return drill ? <button key={category} onClick={() => drill(category)} aria-label={"Show records for " + category} className="inline-flex min-w-0 max-w-full items-center gap-1.5 [overflow-wrap:anywhere] rounded-full border border-zinc-200 px-2 py-1 text-xs font-medium hover:border-emerald-600 dark:border-zinc-700">{chart.yKeys.length === 1 && marker}{chart.filterKey === "service" || chart.filterKey === "aging" ? category : titleCase(category)}</button> :
            <span key={category} className="inline-flex items-center gap-1.5 text-xs">{marker}{titleCase(category)}</span>;
        })}
      </div>}
    </div>
  );
}
