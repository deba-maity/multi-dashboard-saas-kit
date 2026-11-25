import { getInventoryLedger } from "./inventoryLedger.js";
import { getMarketingData } from "./marketing.js";
import { getMonitoringData } from "./monitoring.js";
import { getFinanceReport } from "./financeReport.js";
import { getTaskPage } from "./taskPage.js";
import { Prisma } from "@prisma/client";
import { analyticsWindow, bookedOrderStatuses, orderSummary } from "./orderSummary.js";
import { defaultScenarioChange, projectSummary, scenarioCents } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { centsToCurrency, containsText, pageArgs, pagination, reportOrder } from "../utils/http.js";

type DashboardId =
  | "analytics"
  | "ecommerce"
  | "users"
  | "finance"
  | "inventory"
  | "projects"
  | "marketing"
  | "monitoring"
  | "crm"
  | "insights";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centsToCurrency(cents));

type Query = Record<string, unknown>;

const sum = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0);

const categories = <T>(items: T[], pick: (item: T) => string) =>
  [...new Set(items.map(pick))].sort((a, b) => a.localeCompare(b));

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Number(((part / whole) * 100).toFixed(1));

const statusFilter = (value?: unknown) =>
  typeof value === "string" && value && value !== "all" ? value : undefined;

const searchValue = (value?: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

function timeSeries(items: Array<{ date: Date; cents?: number; volume?: number }>) {
  const buckets = new Map<string, { month: string; cents: number; volume: number }>();
  for (const item of items) {
    const key = item.date.toISOString().slice(0, 7);
    const bucket = buckets.get(key) ?? {
      month: item.date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      cents: 0, volume: 0
    };
    bucket.cents += item.cents ?? 0;
    bucket.volume += item.volume ?? 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => ({ month: bucket.month, revenue: centsToCurrency(bucket.cents), volume: bucket.volume }));
}

const orderFilters = [{
  key: "status", label: "Order status",
  options: ["all", "pending", "paid", "shipped", "refunded"].map((v) => ({ label: v, value: v }))
}];

export const getDashboardData = async (dashboard: DashboardId, organizationId: string, query: Query) => {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize);
  const q = searchValue(query.search);
  const status = statusFilter(query.status);

  const direction = query.direction === "desc" ? "desc" : "asc";
  const match = containsText(q);
  const orderWhere = {
    organizationId, ...(status ? { status } : {}),
    ...(q ? { OR: [{ customerName: match }, { channel: match }, { status: match }] } : {})
  };
  switch (dashboard) {
    case "analytics": {
      const window = analyticsWindow(query.period);
      const filtered = { ...orderWhere, ...(window ? { createdAt: { gte: window.start, lt: window.end } } : {}) };
      const [orders, total, rows] = await Promise.all([
        prisma.order.findMany({
          where: { organizationId, ...(window ? { createdAt: { gte: window.previousStart, lt: window.end } } : {}) },
          select: { status: true, channel: true, totalCents: true, createdAt: true },
          orderBy: { createdAt: "asc" }
        }),
        prisma.order.count({ where: filtered }),
        prisma.order.findMany({ where: filtered, orderBy: reportOrder<Prisma.OrderOrderByWithRelationInput>(query.sort, {
          customerName: { customerName: direction }, channel: { channel: direction }, status: { status: direction },
          total: { totalCents: direction }, createdAt: { createdAt: direction }
        }, { createdAt: "desc" }, { id: "asc" }), skip, take })
      ]);
      return {
        id: dashboard,
        title: "Revenue overview",
        description: "Booked revenue includes paid and shipped orders. The order ledger includes every status.",
        ...orderSummary(orders, window),
        table: {
          title: "Order ledger",
          columns: [
            { key: "customerName", label: "Customer" },
            { key: "channel", label: "Channel" },
            { key: "status", label: "Status", type: "status" },
            { key: "total", label: "Order total", type: "currency" },
            { key: "createdAt", label: "Date", type: "date" }
          ],
          rows: rows.map((o) => ({ ...o, total: centsToCurrency(o.totalCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: orderFilters
      };
    }
    case "ecommerce": {
      const where = orderWhere;
      const [orders, rows, total, products] = await Promise.all([
        prisma.order.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
        prisma.order.findMany({ where, include: { items: true }, orderBy: reportOrder<Prisma.OrderOrderByWithRelationInput>(query.sort, {
          customerName: { customerName: direction },
          channel: { channel: direction },
          status: { status: direction },
          total: { totalCents: direction }
        }, { createdAt: "desc" }, { id: "asc" }), skip, take }),
        prisma.order.count({ where }),
        prisma.product.count({ where: { organizationId } })
      ]);
      return {
        id: dashboard,
        title: "E-commerce Operations",
        description: "Orders, revenue, channels, and fulfillment status for commerce teams.",
        metrics: [
          { label: "Gross order value", value: centsToCurrency(sum(orders, (o) => o.totalCents)), format: "currency", tone: "emerald" },
          { label: "Orders", value: orders.length, tone: "sky" },
          { label: "Products", value: products, tone: "violet" },
          { label: "Pending", value: orders.filter((o) => o.status === "pending").length, tone: "amber" }
        ],
        charts: [
          { name: "Sales by month", unit: "USD", type: "area", xKey: "month", yKeys: ["revenue"], data: timeSeries(orders.map((o) => ({ date: o.createdAt, cents: o.totalCents }))) },
          { name: "Orders by channel", type: "bar", xKey: "channel", yKeys: ["orders"], data: categories(orders, (o) => o.channel).map((channel) => ({ channel, orders: orders.filter((o) => o.channel === channel).length })) }
        ],
        table: {
          title: "Order queue",
          columns: [
            { key: "customerName", label: "Customer" },
            { key: "channel", label: "Channel" },
            { key: "items", label: "Units", sortable: false, type: "number" },
            { key: "status", label: "Status", type: "status" },
            { key: "total", label: "Total", type: "currency" }
          ],
          rows: rows.map((o) => ({ id: o.id, customerName: o.customerName, channel: o.channel, items: sum(o.items, (item) => item.quantity), status: o.status, total: centsToCurrency(o.totalCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: orderFilters,
        widgets: [
          { title: "Awaiting payment", value: String(orders.filter((o) => o.status === "pending").length), detail: "Orders with payment pending." },
          { title: "Refund rate", value: percent(orders.filter((o) => o.status === "refunded").length, orders.length) + "%", detail: "Refunded orders as a share of all orders." }
        ]
      };
    }
    case "users": {
      const where = {
        organizationId,
        user: {
          ...(["active", "invited", "suspended"].includes(status ?? "") ? { status: status!.toUpperCase() as "ACTIVE" | "INVITED" | "SUSPENDED" } : {}),
          ...(q ? { OR: [{ name: match }, { email: match }] } : {})
        }
      };
      const [members, rows, total] = await Promise.all([
        prisma.organizationMember.findMany({ where: { organizationId }, select: { role: true, user: { select: { status: true } } } }),
        prisma.organizationMember.findMany({ where, select: { role: true, user: { select: { id: true, name: true, email: true, status: true, lastActiveAt: true } } }, orderBy: reportOrder<Prisma.OrganizationMemberOrderByWithRelationInput>(query.sort, {
          name: { user: { name: direction } },
          email: { user: { email: direction } },
          role: { role: direction },
          status: { user: { status: direction } },
          lastActiveAt: { user: { lastActiveAt: direction } }
        }, { createdAt: "desc" }, { id: "asc" }), skip, take }),
        prisma.organizationMember.count({ where })
      ]);
      return {
        id: dashboard,
        title: "User Management",
        description: "Members, role assignments, access status, and account activity.",
        metrics: [
          { label: "Members", value: members.length, tone: "sky" },
          { label: "Admins", value: members.filter((m) => m.role === "ADMIN").length, tone: "violet" },
          { label: "Active", value: members.filter((m) => m.user.status === "ACTIVE").length, tone: "emerald" },
          { label: "Invited", value: members.filter((m) => m.user.status === "INVITED").length, tone: "amber" }
        ],
        charts: [
          { name: "Role mix", type: "bar", xKey: "role", yKeys: ["members"], data: ["ADMIN", "MEMBER"].map((role) => ({ role, members: members.filter((m) => m.role === role).length })) },
          { name: "Activity status", filterKey: "status", type: "pie", xKey: "status", yKeys: ["count"], data: ["ACTIVE", "INVITED", "SUSPENDED"].map((s) => ({ status: s, count: members.filter((m) => m.user.status === s).length })) }
        ],
        table: {
          title: "Team directory",
          columns: [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role", type: "status" },
            { key: "status", label: "Status", type: "status" },
            { key: "lastActiveAt", label: "Last active", type: "date" }
          ],
          rows: rows.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role, status: m.user.status, lastActiveAt: m.user.lastActiveAt })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "status", label: "Account status", options: ["all", "active", "invited", "suspended"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Access", value: String(members.filter((m) => m.role === "ADMIN").length) + " admins", detail: "Administrators can add members and update task status." },
          { title: "Pending invitations", value: String(members.filter((m) => m.user.status === "INVITED").length), detail: "Members whose account status is invited." }
        ]
      };
    }
    case "finance": return getFinanceReport(organizationId, query);
    case "inventory": {
      const reorderPoint = prisma.inventoryItem.fields.reorderPoint;
      const lowStock = { organizationId, stock: { lte: reorderPoint } };
      const [warehouses, suppliers, lowCount, preview, table] = await Promise.all([
        prisma.inventoryItem.groupBy({ by: ["warehouse"], where: { organizationId }, _count: { _all: true }, _sum: { stock: true } }),
        prisma.inventoryItem.groupBy({ by: ["supplier"], where: { organizationId } }),
        prisma.inventoryItem.count({ where: lowStock }),
        prisma.inventoryItem.findMany({ where: lowStock, orderBy: [{ stock: "asc" }, { id: "asc" }], take: 5,
          select: { product: { select: { sku: true } } } }),
        getInventoryLedger(organizationId, query)
      ]);
      const itemCount = sum(warehouses, (row) => row._count._all);
      const units = sum(warehouses, (row) => row._sum.stock ?? 0);
      const skuList = preview.map((row) => row.product.sku).join(", ");
      const reorderDetail = lowCount > preview.length ? skuList + ", and " + (lowCount - preview.length) + " more." : skuList;
      return {
        id: dashboard,
        title: "Inventory Control",
        description: "Stock health, product movement, supplier exposure, and reorder alerts.",
        metrics: [
          { label: "SKUs tracked", value: itemCount, tone: "sky" },
          { label: "Units on hand", value: units, tone: "violet" },
          { label: "Low stock", value: lowCount, tone: "rose" },
          { label: "Avg stock per SKU", value: `${Math.round(units / Math.max(itemCount, 1))} units`, tone: "amber" }
        ],
        charts: [
          { name: "Stock by warehouse", type: "bar", xKey: "warehouse", yKeys: ["stock"], data: warehouses.sort((a, b) => a.warehouse.localeCompare(b.warehouse)).map((row) => ({ warehouse: row.warehouse, stock: row._sum.stock ?? 0 })) },
          { name: "Reorder risk", filterKey: "status", type: "bar", xKey: "status", yKeys: ["count"], data: [{ status: "Low", count: lowCount }, { status: "Healthy", count: itemCount - lowCount }] }
        ],
        table,
        filters: [{ key: "status", label: "Stock health", options: [{ label: "All", value: "all" }, { label: "Low", value: "low" }, { label: "Healthy", value: "healthy" }] }],
        widgets: [
          { title: "Reorder list", value: lowCount + " SKUs", detail: reorderDetail || "All stocked above reorder point." },
          { title: "Suppliers", value: String(suppliers.length), detail: "Distinct suppliers in the stock ledger." }
        ]
      };
    }
    case "projects": {
      const [tasks, taskPage] = await Promise.all([
        prisma.task.findMany({ where: { organizationId }, select: { status: true, priority: true } }),
        getTaskPage(organizationId, q, status, page, pageSize, reportOrder<Prisma.TaskOrderByWithRelationInput>(query.sort, {
          title: { title: direction },
          project: { project: direction },
          assignee: { assignee: { name: direction } },
          priority: { priority: direction },
          status: { status: direction },
          dueDate: { dueDate: direction }
        }, { dueDate: "asc" }, { id: "asc" }))
      ]);
      return {
        id: dashboard,
        title: "Project Delivery",
        description: "Task throughput, ownership, delivery risk, and sprint execution.",
        ...projectSummary(tasks),
        table: {
          title: "Delivery board",
          columns: [
            { key: "title", label: "Task" },
            { key: "project", label: "Project" },
            { key: "assignee", label: "Assignee" },
            { key: "priority", label: "Priority", type: "status" },
            { key: "status", label: "Status", type: "status" },
            { key: "dueDate", label: "Due", type: "date" }
          ],
          ...taskPage
        },
        filters: [
          { key: "status", label: "Task status", options: ["all", "todo", "in-progress", "done", "blocked"].map((v) => ({ label: v, value: v })) }
        ]
      };
    }
    case "marketing": return getMarketingData(organizationId, query);
    case "monitoring": return getMonitoringData(organizationId, query);
    case "crm": {
      const stage = statusFilter(query.stage ?? query.status);
      const where = { organizationId, ...(stage ? { stage } : {}), ...(q ? { OR: [{ company: match }, { name: match }, { source: match }] } : {}) };
      const [leads, contacts, rows, total] = await Promise.all([
        prisma.lead.findMany({ where: { organizationId } }),
        prisma.contact.count({ where: { organizationId } }),
        prisma.lead.findMany({ where, orderBy: reportOrder<Prisma.LeadOrderByWithRelationInput>(query.sort, {
          name: { name: direction },
          company: { company: direction },
          source: { source: direction },
          stage: { stage: direction },
          value: { valueCents: direction }
        }, { valueCents: "desc" }, { id: "asc" }), skip, take }),
        prisma.lead.count({ where })
      ]);
      return {
        id: dashboard,
        title: "CRM Pipeline",
        description: "Lead flow, contacts, deal stages, and forecast quality for sales teams.",
        metrics: [
          { label: "Pipeline", value: centsToCurrency(sum(leads, (l) => l.valueCents)), format: "currency", tone: "emerald" },
          { label: "Leads", value: leads.length, tone: "sky" },
          { label: "Contacts", value: contacts, tone: "violet" },
          { label: "Win probability", value: `${Math.round(sum(leads, (l) => l.probability) / Math.max(leads.length, 1))}%`, tone: "amber" }
        ],
        charts: [
          { name: "Deal pipeline", unit: "USD", filterKey: "stage", type: "bar", xKey: "stage", yKeys: ["value"], data: ["New", "Qualified", "Demo", "Proposal", "Negotiation"].map((s) => ({ stage: s, value: centsToCurrency(sum(leads.filter((l) => l.stage === s), (l) => l.valueCents)) })) },
          { name: "Lead sources", type: "pie", xKey: "source", yKeys: ["count"], data: categories(leads, (l) => l.source).map((source) => ({ source, count: leads.filter((l) => l.source === source).length })) }
        ],
        table: {
          title: "Open opportunities",
          columns: [
            { key: "name", label: "Lead" },
            { key: "company", label: "Company" },
            { key: "source", label: "Source" },
            { key: "stage", label: "Stage", type: "status" },
            { key: "value", label: "Value", type: "currency" }
          ],
          rows: rows.map((l) => ({ ...l, value: centsToCurrency(l.valueCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "stage", label: "Stage", options: ["all", "New", "Qualified", "Demo", "Proposal", "Negotiation"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Weighted pipeline", value: money(sum(leads, (l) => l.valueCents * l.probability / 100)), detail: "Deal value weighted by each lead’s win probability." },
          { title: "In negotiation", value: String(leads.filter((l) => l.stage === "Negotiation").length), detail: "Opportunities at the negotiation stage." }
        ]
      };
    }
    case "insights": {
      const category = statusFilter(query.category ?? query.status);
      const where = { organizationId, ...(category ? { category } : {}), ...(q ? { OR: [{ title: match }, { summary: match }, { category: match }] } : {}) };
      const [insights, rows, total, recentOrders, months] = await Promise.all([
        prisma.insight.findMany({ where: { organizationId } }),
        prisma.insight.findMany({ where, orderBy: reportOrder<Prisma.InsightOrderByWithRelationInput>(query.sort, {
          category: { category: direction },
          title: { title: direction },
          summary: { summary: direction },
          impactScore: { impactScore: direction },
          confidence: { confidence: direction }
        }, { impactScore: "desc" }, { id: "asc" }), skip, take }),
        prisma.insight.count({ where }),
        prisma.order.findMany({ where: { organizationId }, select: {totalCents: true}, orderBy: [{createdAt: "desc"}, {id: "asc"}], take: 8 }),
        prisma.$queryRaw<Array<{ month: Date; cents: bigint }>>`
          SELECT date_trunc('month', "createdAt") AS month,
            coalesce(sum("totalCents") FILTER (WHERE status IN (${Prisma.join(bookedOrderStatuses)})), 0) AS cents
          FROM "Order" WHERE "organizationId" = ${organizationId} GROUP BY 1 ORDER BY 1`
      ]);
      return {
        id: dashboard,
        title: "AI Insights",
        description: "Review recommendation scores and explore how a change in booked revenue would affect each month.",
        metrics: [
          { label: "Recommendations", value: insights.length, tone: "violet" },
          { label: "Avg confidence", value: `${Math.round(sum(insights, (i) => i.confidence) / Math.max(insights.length, 1))}%`, tone: "emerald" },
          { label: "Impact score", value: Math.round(sum(insights, (i) => i.impactScore) / Math.max(insights.length, 1)), tone: "sky" },
          { label: "Last 8 orders", value: centsToCurrency(sum(recentOrders, (o) => o.totalCents)), format: "currency", tone: "amber" }
        ],
        charts: [
          { name: "Insight impact", filterKey: "category", type: "bar", xKey: "category", yKeys: ["impact"], data: ["Revenue", "Retention", "Risk", "Ops"].map((category) => ({ category, impact: Math.round(sum(insights.filter((i) => i.category === category), (i) => i.impactScore) / Math.max(insights.filter((i) => i.category === category).length, 1)) })) },
          { name: "Booked revenue scenario", kind: "booked-revenue-scenario", unit: "USD", type: "line", xKey: "month", yKeys: ["booked", "scenario"],
            data: months.map(({ month, cents }) => ({ month: month.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
              booked: centsToCurrency(Number(cents)), scenario: centsToCurrency(scenarioCents(Number(cents), defaultScenarioChange)) })) }
        ],
        table: {
          title: "Recommendation queue", recordKey: "title",
          columns: [
            { key: "category", label: "Category", type: "status" },
            { key: "title", label: "Recommendation" },
            { key: "summary", label: "Summary" },
            { key: "impactScore", label: "Impact", type: "number" },
            { key: "confidence", label: "Confidence", type: "percent" }
          ],
          rows,
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "category", label: "Category", options: ["all", "Revenue", "Retention", "Risk", "Ops"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Recommendation scores", value: "Stored ratings", detail: "Impact and confidence come from the saved recommendation records." }
        ]
      };
    }
  }
};
