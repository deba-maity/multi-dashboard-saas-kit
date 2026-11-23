import type { DashboardResponse } from "@saas-kit/shared";
import { centsToCurrency } from "../utils/http.js";

const day = 86400000;
export function analyticsWindow(period: unknown, now = new Date()) {
  if (period !== "30" && period !== "90") return null;
  const duration = Number(period) * day;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { days: Number(period), start: new Date(+end - duration), end, previousStart: new Date(+end - duration * 2) };
}

type Order = { createdAt: Date; totalCents: number; status: string; channel: string };
const isBooked = (order: Order) => ["paid", "shipped"].includes(order.status);

function totals(orders: Order[]) {
  const booked = orders.filter(isBooked);
  const cents = booked.reduce((sum, order) => sum + order.totalCents, 0);
  return [centsToCurrency(cents), orders.length, booked.length, booked.length ? centsToCurrency(Math.round(cents / booked.length)) : 0];
}

export function orderSummary(orders: Order[], window: ReturnType<typeof analyticsWindow>) {
  const current = window ? orders.filter((o) => o.createdAt >= window.start && o.createdAt < window.end) : orders;
  const previous = window ? totals(orders.filter((o) => o.createdAt >= window.previousStart && o.createdAt < window.start)) : null;
  const values = totals(current);
  const labels = ["Booked revenue", "Orders", "Booked orders", "Avg booked order"];
  const tones = ["emerald", "sky", "violet", "amber"] as const;
  const metrics = labels.map((label, i) => ({
    label, value: values[i], tone: tones[i], ...(i === 0 || i === 3 ? { format: "currency" as const } : {}),
    ...(previous?.[i] ? { change: Math.round((values[i] - previous[i]) * 1000 / previous[i]) / 10 } : {})
  }));
  const buckets = new Map<string, { period: string; cents: number; orders: number }>();
  const channels = new Map<string, number>();
  const byDay = window?.days === 30;
  const label = new Intl.DateTimeFormat("en-US", { month: "short", ...(byDay ? { day: "numeric" } : { year: "numeric" }), timeZone: "UTC" });
  function bucketFor(date: Date) {
    const key = date.toISOString().slice(0, byDay ? 10 : 7);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { period: label.format(date), cents: 0, orders: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  }
  if (window) for (let stamp = +window.start; stamp < +window.end; stamp += day) bucketFor(new Date(stamp));
  for (const order of current) {
    const bucket = bucketFor(order.createdAt);
    bucket.orders++;
    if (isBooked(order)) {
      bucket.cents += order.totalCents;
      channels.set(order.channel, (channels.get(order.channel) ?? 0) + order.totalCents);
    }
  }
  const series = [...buckets].sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => ({ period: bucket.period, revenue: centsToCurrency(bucket.cents), orders: bucket.orders }));
  const best = [...channels].sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0];
  return {
    metrics,
    periodLabel: window ? window.start.toISOString().slice(0, 10) + " – " + new Date(+window.end - day).toISOString().slice(0, 10) + " UTC" : "All recorded orders",
    charts: [
      { name: "Booked revenue", unit: "USD", type: "area", xKey: "period", yKeys: ["revenue"], data: series },
      { name: "Order volume", type: "bar", xKey: "period", yKeys: ["orders"], data: series }
    ],
    widgets: [
      { title: "Top channel", value: best?.[0] ?? "No booked orders", detail: best && values[0] ? Math.round(centsToCurrency(best[1]) * 100 / values[0]) + "% of booked revenue." : "Paid and shipped orders appear here." },
      { title: "Pending orders", value: current.filter((o) => o.status === "pending").length + " awaiting payment", detail: "Pending payments are excluded from booked revenue." }
    ]
  } satisfies Pick<DashboardResponse, "metrics" | "charts" | "widgets" | "periodLabel">;
}
