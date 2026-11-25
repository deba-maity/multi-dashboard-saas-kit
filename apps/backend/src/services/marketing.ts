import { Prisma } from "@prisma/client";
import type { DashboardResponse } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { centsToCurrency, containsText, pageArgs, pagination } from "../utils/http.js";

type Query = Record<string, unknown>;
type CampaignRow = {
  id: string; name: string; channel: string; clicks: number; conversions: number;
  spendCents: number; revenueCents: number; roi: number | null;
};

const sortColumns = new Map<string, Prisma.Sql>([
  ["name", Prisma.sql`name`], ["channel", Prisma.sql`channel`], ["clicks", Prisma.sql`clicks`],
  ["conversions", Prisma.sql`conversions`], ["spend", Prisma.sql`"spendCents"`],
  ["revenue", Prisma.sql`"revenueCents"`], ["roi", Prisma.sql`roi`]
]);

export async function getCampaignLedger(organizationId: string, query: Query): Promise<DashboardResponse["table"]> {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize);
  const channel = typeof query.channel === "string" ? query.channel : "";
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const pattern = "%" + (containsText(search).contains ?? "") + "%";
  const where = Prisma.sql`WHERE "organizationId" = ${organizationId}
    ${channel && channel !== "all" ? Prisma.sql`AND channel = ${channel}` : Prisma.empty}
    ${search ? Prisma.sql`AND (name ILIKE ${pattern} OR channel ILIKE ${pattern})` : Prisma.empty}`;
  const direction = query.direction === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const column = sortColumns.get(String(query.sort ?? ""));
  const order = column ? Prisma.sql`${column} ${direction} NULLS LAST` : Prisma.sql`"launchedAt" DESC`;
  const [campaigns, [count]] = await Promise.all([
    prisma.$queryRaw<CampaignRow[]>`SELECT id, name, channel, clicks, conversions, "spendCents", "revenueCents",
      round(("revenueCents"::numeric - "spendCents") * 100 / nullif("spendCents", 0), 1)::float8 AS roi
      FROM "Campaign" ${where} ORDER BY ${order}, id ASC LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw<Array<{total: bigint}>>`SELECT count(*) AS total FROM "Campaign" ${where}`
  ]);
  return {
    title: "Campaign scorecard", recordKey: "name",
    columns: [
      { key: "name", label: "Campaign" }, { key: "channel", label: "Channel" },
      { key: "clicks", label: "Clicks", type: "number" }, { key: "conversions", label: "Conversions", type: "number" },
      { key: "spend", label: "Spend", type: "currency" }, { key: "revenue", label: "Revenue", type: "currency" },
      { key: "roi", label: "ROI", type: "percent", nullsLast: true }
    ],
    rows: campaigns.map(({spendCents, revenueCents, ...row}) => ({
      ...row, spend: centsToCurrency(spendCents), revenue: centsToCurrency(revenueCents)
    })),
    pagination: pagination(page, pageSize, Number(count.total))
  };
}

export async function getMarketingData(organizationId: string, query: Query): Promise<DashboardResponse> {
  const [channels, months, table] = await Promise.all([
    prisma.campaign.groupBy({ by: ["channel"], where: {organizationId}, orderBy: {channel: "asc"},
      _count: {_all: true}, _sum: {spendCents: true, revenueCents: true, clicks: true, conversions: true} }),
    prisma.$queryRaw<Array<{month: Date; clicks: bigint}>>`SELECT date_trunc('month', "launchedAt") AS month,
      sum(clicks) AS clicks FROM "Campaign" WHERE "organizationId" = ${organizationId} GROUP BY 1 ORDER BY 1`,
    getCampaignLedger(organizationId, query)
  ]);
  const sum = (field: "spendCents" | "revenueCents" | "clicks" | "conversions") =>
    channels.reduce((total, row) => total + (row._sum[field] ?? 0), 0);
  const spend = sum("spendCents"), revenue = sum("revenueCents");
  const clicks = sum("clicks"), conversions = sum("conversions");
  const percentage = (part: number, whole: number) => whole ? Number((100 * part / whole).toFixed(1)) + "%" : "—";
  return {
    id: "marketing", title: "Marketing Performance",
    description: "Compare acquisition channels and rank campaigns by their return on recorded spend.",
    metrics: [
      { label: "Spend", value: centsToCurrency(spend), format: "currency", tone: "amber" },
      { label: "Revenue", value: centsToCurrency(revenue), format: "currency", tone: "emerald" },
      { label: "Clicks", value: clicks, tone: "sky" },
      { label: "Conversion rate", value: percentage(conversions, clicks), tone: "violet" }
    ],
    charts: [
      { name: "Revenue by channel", unit: "USD", filterKey: "channel", type: "bar", xKey: "channel", yKeys: ["revenue"],
        data: channels.map((row) => ({channel: row.channel, revenue: centsToCurrency(row._sum.revenueCents ?? 0)})) },
      { name: "Clicks by launch month", type: "line", xKey: "month", yKeys: ["clicks"],
        data: months.map((row) => ({ month: row.month.toLocaleString("en-US", {month: "short", year: "numeric", timeZone: "UTC"}), clicks: Number(row.clicks) })) }
    ],
    table,
    filters: [{ key: "channel", label: "Channel", options: ["all", ...channels.map((row) => row.channel)].map((value) => ({label: value, value})) }],
    widgets: [
      { title: "Return on campaign spend", value: percentage(revenue - spend, spend),
        detail: "Revenue less spend, divided by total spend. Campaigns with zero spend have no individual ROI." },
      { title: "Total conversions", value: String(conversions), detail: "Conversions reported across " +
        channels.reduce((total, row) => total + row._count._all, 0) + " campaigns." }
    ]
  };
}
