import { getTaskPage } from "./taskPage.js";
import type { Prisma } from "@prisma/client";
import { analyticsWindow, orderSummary } from "./orderSummary.js";
import { projectSummary } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { centsToCurrency, pageArgs, pagination } from "../utils/http.js";

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
  const match = { contains: q, mode: "insensitive" as const };
  const orderWhere = {
    organizationId, ...(status ? { status } : {}),
    ...(q ? { OR: [{ customerName: match }, { channel: match }, { status: match }] } : {})
  };
  function tableOrder<T>(columns: Record<string, T>, fallback: T, tie: T): T[] {
    const key = String(query.sort ?? "");
    return [Object.hasOwn(columns, key) ? columns[key] : fallback, tie];
  }
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
        prisma.order.findMany({ where: filtered, orderBy: tableOrder<Prisma.OrderOrderByWithRelationInput>({
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
        prisma.order.findMany({ where, include: { items: true }, orderBy: tableOrder<Prisma.OrderOrderByWithRelationInput>({
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
        prisma.organizationMember.findMany({ where, select: { role: true, user: { select: { id: true, name: true, email: true, status: true, lastActiveAt: true } } }, orderBy: tableOrder<Prisma.OrganizationMemberOrderByWithRelationInput>({
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
    case "finance": {
      const where = { organizationId, ...(status ? { status } : {}), ...(q ? { OR: [{ description: match }, { type: match }, { status: match }] } : {}) };
      const [transactions, rows, total, invoices] = await Promise.all([
        prisma.transaction.findMany({ where: { organizationId }, orderBy: { occurredAt: "asc" } }),
        prisma.transaction.findMany({ where, orderBy: tableOrder<Prisma.TransactionOrderByWithRelationInput>({
          description: { description: direction },
          type: { type: direction },
          status: { status: direction },
          amount: { amountCents: direction },
          occurredAt: { occurredAt: direction }
        }, { occurredAt: "desc" }, { id: "asc" }), skip, take }),
        prisma.transaction.count({ where }),
        prisma.invoice.findMany({ where: { organizationId } })
      ]);
      return {
        id: dashboard,
        title: "Finance & Billing",
        description: "Payment history, invoice aging, recurring revenue, and collection state.",
        metrics: [
          { label: "Settled cashflow", value: centsToCurrency(sum(transactions.filter((t) => t.status === "paid"), (t) => t.amountCents)), format: "currency", tone: "emerald" },
          { label: "Paid invoices", value: invoices.filter((i) => i.status === "paid").length, tone: "sky" },
          { label: "Overdue", value: invoices.filter((i) => i.status === "overdue").length, tone: "rose" },
          { label: "Pending amount", value: centsToCurrency(sum(transactions.filter((t) => t.status === "pending"), (t) => t.amountCents)), format: "currency", tone: "amber" }
        ],
        charts: [
          { name: "Settled cashflow", unit: "USD", type: "line", xKey: "month", yKeys: ["revenue"], data: timeSeries(transactions.filter((t) => t.status === "paid").map((t) => ({ date: t.occurredAt, cents: t.amountCents }))) },
          { name: "Invoice aging", type: "bar", xKey: "status", yKeys: ["count"], data: ["paid", "open", "overdue"].map((s) => ({ status: s, count: invoices.filter((i) => i.status === s).length })) }
        ],
        table: {
          title: "Transaction ledger",
          columns: [
            { key: "description", label: "Description" },
            { key: "type", label: "Type" },
            { key: "status", label: "Status", type: "status" },
            { key: "amount", label: "Amount", type: "currency" },
            { key: "occurredAt", label: "Date", type: "date" }
          ],
          rows: rows.map((t) => ({ ...t, amount: centsToCurrency(t.amountCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "status", label: "Payment status", options: ["all", "paid", "open", "pending", "failed"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Unpaid invoices", value: String(invoices.filter((i) => i.status !== "paid").length), detail: "Open and overdue invoices." },
          { title: "Failed payments", value: String(transactions.filter((t) => t.status === "failed").length), detail: "Failed transactions in the ledger." }
        ]
      };
    }
    case "inventory": {
      const reorderPoint = prisma.inventoryItem.fields.reorderPoint;
      const stock = status === "low" ? { lte: reorderPoint } : status === "healthy" ? { gt: reorderPoint } : undefined;
      const where = {
        organizationId, stock,
        ...(q ? { OR: [{ product: { name: match } }, { product: { sku: match } }, { warehouse: match }] } : {})
      };
      const [items, rows, total] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { organizationId }, include: { product: true } }),
        prisma.inventoryItem.findMany({ where, include: { product: true }, orderBy: tableOrder<Prisma.InventoryItemOrderByWithRelationInput>({
          product: { product: { name: direction } },
          sku: { product: { sku: direction } },
          warehouse: { warehouse: direction },
          stock: { stock: direction },
          reorderPoint: { reorderPoint: direction }
        }, { stock: "asc" }, { id: "asc" }), skip, take }),
        prisma.inventoryItem.count({ where })
      ]);
      const low = items.filter((i) => i.stock <= i.reorderPoint);
      return {
        id: dashboard,
        title: "Inventory Control",
        description: "Stock health, product movement, supplier exposure, and reorder alerts.",
        metrics: [
          { label: "SKUs tracked", value: items.length, tone: "sky" },
          { label: "Units on hand", value: sum(items, (i) => i.stock), tone: "violet" },
          { label: "Low stock", value: low.length, tone: "rose" },
          { label: "Avg stock per SKU", value: `${Math.round(sum(items, (i) => i.stock) / Math.max(items.length, 1))} units`, tone: "amber" }
        ],
        charts: [
          { name: "Stock by warehouse", type: "bar", xKey: "warehouse", yKeys: ["stock"], data: categories(items, (i) => i.warehouse).map((warehouse) => ({ warehouse, stock: sum(items.filter((i) => i.warehouse === warehouse), (i) => i.stock) })) },
          { name: "Reorder risk", filterKey: "status", type: "bar", xKey: "status", yKeys: ["count"], data: [{ status: "Low", count: low.length }, { status: "Healthy", count: items.length - low.length }] }
        ],
        table: {
          title: "Stock ledger",
          columns: [
            { key: "product", label: "Product" },
            { key: "sku", label: "SKU" },
            { key: "warehouse", label: "Warehouse" },
            { key: "stock", label: "Stock", type: "number" },
            { key: "reorderPoint", label: "Reorder at", type: "number" },
            { key: "status", label: "Stock health", type: "status", sortable: false }
          ],
          rows: rows.map((i) => ({ id: i.id, product: i.product.name, sku: i.product.sku, warehouse: i.warehouse, stock: i.stock, reorderPoint: i.reorderPoint, status: i.stock <= i.reorderPoint ? "low" : "healthy" })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [{ key: "status", label: "Stock health", options: [{ label: "All", value: "all" }, { label: "Low", value: "low" }, { label: "Healthy", value: "healthy" }] }],
        widgets: [
          { title: "Reorder list", value: low.length + " SKUs", detail: low.map((i) => i.product.sku).join(", ") || "All stocked above reorder point." },
          { title: "Suppliers", value: String(new Set(items.map((i) => i.supplier)).size), detail: "Distinct suppliers in the stock ledger." }
        ]
      };
    }
    case "projects": {
      const [tasks, taskPage] = await Promise.all([
        prisma.task.findMany({ where: { organizationId }, select: { status: true, priority: true } }),
        getTaskPage(organizationId, q, status, page, pageSize, tableOrder<Prisma.TaskOrderByWithRelationInput>({
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
    case "marketing": {
      const channel = statusFilter(query.channel);
      const where = { organizationId, ...(channel ? { channel } : {}), ...(q ? { OR: [{ name: match }, { channel: match }] } : {}) };
      const [campaigns, rows, total] = await Promise.all([
        prisma.campaign.findMany({ where: { organizationId } }),
        prisma.campaign.findMany({ where, orderBy: tableOrder<Prisma.CampaignOrderByWithRelationInput>({
          name: { name: direction },
          channel: { channel: direction },
          clicks: { clicks: direction },
          conversions: { conversions: direction }
        }, { launchedAt: "desc" }, { id: "asc" }), skip, take }),
        prisma.campaign.count({ where })
      ]);
      return {
        id: dashboard,
        title: "Marketing Performance",
        description: "Campaign ROI, channel mix, conversion quality, and funnel efficiency.",
        metrics: [
          { label: "Spend", value: centsToCurrency(sum(campaigns, (c) => c.spendCents)), format: "currency", tone: "amber" },
          { label: "Revenue", value: centsToCurrency(sum(campaigns, (c) => c.revenueCents)), format: "currency", tone: "emerald" },
          { label: "Clicks", value: sum(campaigns, (c) => c.clicks), tone: "sky" },
          { label: "CVR", value: `${percent(sum(campaigns, (c) => c.conversions), sum(campaigns, (c) => c.clicks))}%`, tone: "violet" }
        ],
        charts: [
          { name: "Revenue by channel", unit: "USD", filterKey: "channel", type: "bar", xKey: "channel", yKeys: ["revenue"], data: categories(campaigns, (c) => c.channel).map((c) => ({ channel: c, revenue: centsToCurrency(sum(campaigns.filter((x) => x.channel === c), (x) => x.revenueCents)) })) },
          { name: "Clicks by launch month", type: "line", xKey: "month", yKeys: ["clicks"], data: timeSeries(campaigns.map((c) => ({ date: c.launchedAt, volume: c.clicks }))).map((row) => ({ month: row.month, clicks: row.volume })) }
        ],
        table: {
          title: "Campaign scorecard",
          columns: [
            { key: "name", label: "Campaign" },
            { key: "channel", label: "Channel" },
            { key: "clicks", label: "Clicks", type: "number" },
            { key: "conversions", label: "Conversions", type: "number" },
            { key: "roi", label: "ROI", sortable: false, type: "percent" }
          ],
          rows: rows.map((c) => ({ id: c.id, name: c.name, channel: c.channel, clicks: c.clicks, conversions: c.conversions, roi: percent(c.revenueCents - c.spendCents, c.spendCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "channel", label: "Channel", options: ["all", ...categories(campaigns, (c) => c.channel)].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Total conversions", value: String(sum(campaigns, (c) => c.conversions)), detail: "Conversions reported by all campaigns." },
          { title: "Campaigns", value: String(campaigns.length), detail: "Campaigns included in the scorecard." }
        ]
      };
    }
    case "monitoring": {
      const level = statusFilter(query.level ?? query.status);
      const where = { organizationId, ...(level ? { level } : {}), ...(q ? { OR: [{ message: match }, { service: match }] } : {}) };
      const [logs, rows, total] = await Promise.all([
        prisma.systemLog.findMany({ where: { organizationId } }),
        prisma.systemLog.findMany({ where, orderBy: tableOrder<Prisma.SystemLogOrderByWithRelationInput>({
          level: { level: direction },
          service: { service: direction },
          message: { message: direction },
          latencyMs: { latencyMs: direction },
          createdAt: { createdAt: direction }
        }, { createdAt: "desc" }, { id: "asc" }), skip, take }),
        prisma.systemLog.count({ where })
      ]);
      const latencies = logs.map((log) => log.latencyMs).sort((a, b) => a - b);
      const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
      return {
        id: dashboard,
        title: "System Monitoring",
        description: "Service health, logs, latency, error trends, and incident signals.",
        metrics: [
          { label: "Log events", value: logs.length, tone: "emerald" },
          { label: "Errors", value: logs.filter((l) => l.level === "error").length, tone: "rose" },
          { label: "P95 latency", value: p95 === undefined ? "—" : p95 + " ms", tone: "sky" },
          { label: "Services", value: new Set(logs.map((l) => l.service)).size, tone: "violet" }
        ],
        charts: [
          { name: "Log levels", filterKey: "level", type: "bar", xKey: "level", yKeys: ["count"], data: ["info", "warn", "error"].map((l) => ({ level: l, count: logs.filter((x) => x.level === l).length })) },
          { name: "Latency by service", unit: "ms", type: "bar", xKey: "service", yKeys: ["latency"], data: categories(logs, (log) => log.service).map((service) => ({ service, latency: Math.round(sum(logs.filter((l) => l.service === service), (l) => l.latencyMs) / Math.max(logs.filter((l) => l.service === service).length, 1)) })) }
        ],
        table: {
          title: "Event log",
          columns: [
            { key: "level", label: "Level", type: "status" },
            { key: "service", label: "Service" },
            { key: "message", label: "Message" },
            { key: "latencyMs", label: "Latency (ms)", type: "number" },
            { key: "createdAt", label: "Time", type: "datetime" }
          ],
          rows,
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "level", label: "Level", options: ["all", "info", "warn", "error"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Error share", value: percent(logs.filter((l) => l.level === "error").length, logs.length) + "%", detail: "Error events as a share of recorded logs." },
          { title: "Latency sample", value: String(logs.length) + " events", detail: "P95 uses the nearest-rank percentile across recorded event latencies." }
        ]
      };
    }
    case "crm": {
      const stage = statusFilter(query.stage ?? query.status);
      const where = { organizationId, ...(stage ? { stage } : {}), ...(q ? { OR: [{ company: match }, { name: match }, { source: match }] } : {}) };
      const [leads, contacts, rows, total] = await Promise.all([
        prisma.lead.findMany({ where: { organizationId } }),
        prisma.contact.count({ where: { organizationId } }),
        prisma.lead.findMany({ where, orderBy: tableOrder<Prisma.LeadOrderByWithRelationInput>({
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
      const [insights, rows, total, orders] = await Promise.all([
        prisma.insight.findMany({ where: { organizationId } }),
        prisma.insight.findMany({ where, orderBy: tableOrder<Prisma.InsightOrderByWithRelationInput>({
          category: { category: direction },
          title: { title: direction },
          summary: { summary: direction },
          impactScore: { impactScore: direction },
          confidence: { confidence: direction }
        }, { impactScore: "desc" }, { id: "asc" }), skip, take }),
        prisma.insight.count({ where }),
        prisma.order.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } })
      ]);
      return {
        id: dashboard,
        title: "AI Insights",
        description: "Sample recommendations and a scenario showing monthly order value with a 12% uplift.",
        metrics: [
          { label: "Recommendations", value: insights.length, tone: "violet" },
          { label: "Avg confidence", value: `${Math.round(sum(insights, (i) => i.confidence) / Math.max(insights.length, 1))}%`, tone: "emerald" },
          { label: "Impact score", value: Math.round(sum(insights, (i) => i.impactScore) / Math.max(insights.length, 1)), tone: "sky" },
          { label: "Last 8 orders", value: centsToCurrency(sum(orders.slice(-8), (o) => o.totalCents)), format: "currency", tone: "amber" }
        ],
        charts: [
          { name: "Insight impact", filterKey: "category", type: "bar", xKey: "category", yKeys: ["impact"], data: ["Revenue", "Retention", "Risk", "Ops"].map((category) => ({ category, impact: Math.round(sum(insights.filter((i) => i.category === category), (i) => i.impactScore) / Math.max(insights.filter((i) => i.category === category).length, 1)) })) },
          { name: "Revenue scenario (+12%)", unit: "USD", type: "line", xKey: "month", yKeys: ["revenue"], data: timeSeries(orders.map((o) => ({ date: o.createdAt, cents: o.totalCents }))).map((row) => ({ ...row, revenue: Math.round(Number(row.revenue) * 1.12) })) }
        ],
        table: {
          title: "Recommendation queue",
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
          { title: "Scenario assumption", value: "+12%", detail: "Each historical month’s order value multiplied by 1.12." },
          { title: "Recommendation scores", value: "Stored ratings", detail: "Impact and confidence come from the saved recommendation records." }
        ]
      };
    }
  }
};
