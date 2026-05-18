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

export function ChartCard({ chart }: { chart: ChartSeries }) {
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
      <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} fontSize={12} />
      <YAxis tickLine={false} axisLine={false} fontSize={12} />
      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7" }} />
    </>
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">{chart.name}</h3>
        <span className="text-xs font-medium uppercase text-zinc-400">{chart.type}</span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Line key={key} type="monotone" dataKey={key} stroke={colors[index]} strokeWidth={2.5} dot={false} />
              ))}
            </LineChart>
          ) : chart.type === "area" ? (
            <AreaChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Area key={key} type="monotone" dataKey={key} stroke={colors[index]} fill={colors[index]} fillOpacity={0.15} />
              ))}
            </AreaChart>
          ) : chart.type === "pie" ? (
            <PieChart>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7" }} />
              <Pie data={chart.data} dataKey={chart.yKeys[0]} nameKey={chart.xKey} innerRadius={55} outerRadius={95} paddingAngle={4}>
                {chart.data.map((_, index) => (
                  <Cell key={index} fill={colors[index % colors.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={chart.data}>
              {common}
              {chart.yKeys.map((key, index) => (
                <Bar key={key} dataKey={key} fill={colors[index]} radius={[6, 6, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
