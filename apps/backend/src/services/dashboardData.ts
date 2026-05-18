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

type Query = Record<string, unknown>;

const monthKey = (date: Date) =>
  date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });

const sum = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0);

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Number(((part / whole) * 100).toFixed(1));

const statusFilter = (value?: unknown) =>
  typeof value === "string" && value && value !== "all" ? value : undefined;

const searchValue = (value?: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const timeSeries = (items: Array<{ createdAt?: Date; occurredAt?: Date; launchedAt?: Date; totalCents?: number; amountCents?: number; revenueCents?: number }>) => {
  const buckets = new Map<string, Record<string, string | number>>();
  for (const item of items) {
    const date = item.createdAt ?? item.occurredAt ?? item.launchedAt ?? new Date();
    const key = monthKey(date);
    const current = buckets.get(key) ?? { month: key, revenue: 0, volume: 0 };
    current.revenue = Number(current.revenue) + centsToCurrency(item.totalCents ?? item.amountCents ?? item.revenueCents ?? 0);
    current.volume = Number(current.volume) + 1;
    buckets.set(key, current);
  }
  return Array.from(buckets.values());
};

const baseFilters = [
  {
    key: "status",
    label: "Status",
    options: [
      { label: "All statuses", value: "all" },
      { label: "Active", value: "active" },
      { label: "Open", value: "open" },
      { label: "Paid", value: "paid" }
    ]
  }
];

export const getDashboardData = async (dashboard: DashboardId, organizationId: string, query: Query) => {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize);
  const q = searchValue(query.search);
  const status = statusFilter(query.status);

  switch (dashboard) {
    case "analytics": {
      const orders = await prisma.order.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
      const users = await prisma.organizationMember.count({ where: { organizationId } });
      const total = await prisma.order.count({ where: { organizationId } });
      const rows = await prisma.order.findMany({
        where: {
          organizationId,
          ...(q ? { customerName: { contains: q, mode: "insensitive" as const } } : {})
        },
        orderBy: { createdAt: "desc" },
        skip,
        take
      });
      return {
        id: dashboard,
        title: "Analytics Command Center",
        description: "Executive growth, revenue, and acquisition signals across the tenant.",
        metrics: [
          { label: "Revenue", value: centsToCurrency(sum(orders, (o) => o.totalCents)), change: 18.4, tone: "emerald" },
          { label: "Active users", value: users, change: 9.8, tone: "sky" },
          { label: "Growth rate", value: "24.7%", change: 4.2, tone: "violet" },
          { label: "Avg order", value: centsToCurrency(Math.round(sum(orders, (o) => o.totalCents) / Math.max(orders.length, 1))), change: 6.1, tone: "amber" }
        ],
        charts: [
          { name: "Revenue trend", type: "line", xKey: "month", yKeys: ["revenue"], data: timeSeries(orders) },
          { name: "Order volume", type: "bar", xKey: "month", yKeys: ["volume"], data: timeSeries(orders) }
        ],
        table: {
          title: "Recent revenue events",
          columns: [
            { key: "customerName", label: "Customer" },
            { key: "channel", label: "Channel" },
            { key: "status", label: "Status", type: "status" },
            { key: "total", label: "Revenue", type: "currency" },
            { key: "createdAt", label: "Date", type: "date" }
          ],
          rows: rows.map((o) => ({ ...o, total: centsToCurrency(o.totalCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: baseFilters,
        widgets: [
          { title: "North star", value: "Expansion MRR", detail: "Enterprise segment is lifting average contract value.", tone: "emerald" },
          { title: "Watchlist", value: "Checkout drop", detail: "Mobile conversions softened this week.", tone: "amber" }
        ]
      };
    }
    case "ecommerce": {
      const where = { organizationId, ...(status ? { status } : {}), ...(q ? { customerName: { contains: q, mode: "insensitive" as const } } : {}) };
      const [orders, rows, total, products] = await Promise.all([
        prisma.order.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
        prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.order.count({ where }),
        prisma.product.count({ where: { organizationId } })
      ]);
      return {
        id: dashboard,
        title: "E-commerce Operations",
        description: "Orders, revenue, channels, and fulfillment status for commerce teams.",
        metrics: [
          { label: "Gross sales", value: centsToCurrency(sum(orders, (o) => o.totalCents)), change: 12.1, tone: "emerald" },
          { label: "Orders", value: orders.length, change: 7.5, tone: "sky" },
          { label: "Products", value: products, change: 3.2, tone: "violet" },
          { label: "Pending", value: orders.filter((o) => o.status === "pending").length, change: -2.4, tone: "amber" }
        ],
        charts: [
          { name: "Sales by month", type: "area", xKey: "month", yKeys: ["revenue"], data: timeSeries(orders) },
          { name: "Orders by channel", type: "bar", xKey: "channel", yKeys: ["orders"], data: ["Web", "Retail", "Marketplace"].map((channel) => ({ channel, orders: orders.filter((o) => o.channel === channel).length })) }
        ],
        table: {
          title: "Order queue",
          columns: [
            { key: "customerName", label: "Customer" },
            { key: "channel", label: "Channel" },
            { key: "items", label: "Items", type: "number" },
            { key: "status", label: "Status", type: "status" },
            { key: "total", label: "Total", type: "currency" }
          ],
          rows: rows.map((o) => ({ id: o.id, customerName: o.customerName, channel: o.channel, items: o.items.length, status: o.status, total: centsToCurrency(o.totalCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "status", label: "Order status", options: ["all", "pending", "paid", "shipped", "refunded"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Fulfillment SLA", value: "96.2%", detail: "Same-day pick rate across warehouses.", tone: "emerald" },
          { title: "Refund pressure", value: "2.1%", detail: "Below the 30-day benchmark.", tone: "sky" }
        ]
      };
    }
    case "users": {
      const where = {
        organizationId,
        ...(status ? { user: { status: status.toUpperCase() as "ACTIVE" | "INVITED" | "SUSPENDED" } } : {}),
        ...(q ? { user: { name: { contains: q, mode: "insensitive" as const } } } : {})
      };
      const [members, rows, total] = await Promise.all([
        prisma.organizationMember.findMany({ where: { organizationId }, include: { user: true } }),
        prisma.organizationMember.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.organizationMember.count({ where })
      ]);
      return {
        id: dashboard,
        title: "User Management",
        description: "Members, role assignments, access status, and account activity.",
        metrics: [
          { label: "Members", value: members.length, change: 8.8, tone: "sky" },
          { label: "Admins", value: members.filter((m) => m.role === "ADMIN").length, change: 0, tone: "violet" },
          { label: "Active", value: members.filter((m) => m.user.status === "ACTIVE").length, change: 6.2, tone: "emerald" },
          { label: "Invited", value: members.filter((m) => m.user.status === "INVITED").length, change: -1.1, tone: "amber" }
        ],
        charts: [
          { name: "Role mix", type: "bar", xKey: "role", yKeys: ["members"], data: ["ADMIN", "MEMBER"].map((role) => ({ role, members: members.filter((m) => m.role === role).length })) },
          { name: "Activity status", type: "pie", xKey: "status", yKeys: ["count"], data: ["ACTIVE", "INVITED", "SUSPENDED"].map((s) => ({ status: s, count: members.filter((m) => m.user.status === s).length })) }
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
          { title: "Security", value: "RBAC enforced", detail: "Admin-only mutations are protected by middleware.", tone: "emerald" },
          { title: "Lifecycle", value: "3 invites", detail: "Pending seats can be activated from CRUD actions.", tone: "amber" }
        ]
      };
    }
    case "finance": {
      const where = { organizationId, ...(status ? { status } : {}), ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}) };
      const [transactions, rows, total, invoices] = await Promise.all([
        prisma.transaction.findMany({ where: { organizationId }, orderBy: { occurredAt: "asc" } }),
        prisma.transaction.findMany({ where, orderBy: { occurredAt: "desc" }, skip, take }),
        prisma.transaction.count({ where }),
        prisma.invoice.findMany({ where: { organizationId } })
      ]);
      return {
        id: dashboard,
        title: "Finance & Billing",
        description: "Payment history, invoice aging, recurring revenue, and collection state.",
        metrics: [
          { label: "Net cashflow", value: centsToCurrency(sum(transactions, (t) => t.amountCents)), change: 14.9, tone: "emerald" },
          { label: "Paid invoices", value: invoices.filter((i) => i.status === "paid").length, change: 5.3, tone: "sky" },
          { label: "Overdue", value: invoices.filter((i) => i.status === "overdue").length, change: -6.7, tone: "rose" },
          { label: "Pending payout", value: centsToCurrency(sum(transactions.filter((t) => t.status === "pending"), (t) => t.amountCents)), change: 2.2, tone: "amber" }
        ],
        charts: [
          { name: "Cashflow", type: "line", xKey: "month", yKeys: ["revenue"], data: timeSeries(transactions.map((t) => ({ occurredAt: t.occurredAt, amountCents: t.amountCents }))) },
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
          { title: "Dunning", value: "Automated", detail: "Overdue invoices are tagged for follow-up.", tone: "violet" },
          { title: "Runway signal", value: "Healthy", detail: "Collections outpace recurring expenses.", tone: "emerald" }
        ]
      };
    }
    case "inventory": {
      const where = {
        organizationId,
        ...(q ? { product: { name: { contains: q, mode: "insensitive" as const } } } : {})
      };
      const [items, rows, total] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { organizationId }, include: { product: true } }),
        prisma.inventoryItem.findMany({ where, include: { product: true }, orderBy: { stock: "asc" }, skip, take }),
        prisma.inventoryItem.count({ where })
      ]);
      const low = items.filter((i) => i.stock <= i.reorderPoint);
      return {
        id: dashboard,
        title: "Inventory Control",
        description: "Stock health, product movement, supplier exposure, and reorder alerts.",
        metrics: [
          { label: "SKUs tracked", value: items.length, change: 4.4, tone: "sky" },
          { label: "Units on hand", value: sum(items, (i) => i.stock), change: -3.1, tone: "violet" },
          { label: "Low stock", value: low.length, change: 9.5, tone: "rose" },
          { label: "Avg cover", value: `${Math.round(sum(items, (i) => i.stock) / Math.max(items.length, 1))} units`, change: 1.2, tone: "amber" }
        ],
        charts: [
          { name: "Stock by warehouse", type: "bar", xKey: "warehouse", yKeys: ["stock"], data: ["East Hub", "West Hub", "EU 3PL"].map((warehouse) => ({ warehouse, stock: sum(items.filter((i) => i.warehouse === warehouse), (i) => i.stock) })) },
          { name: "Reorder risk", type: "bar", xKey: "risk", yKeys: ["count"], data: [{ risk: "Low", count: low.length }, { risk: "Healthy", count: items.length - low.length }] }
        ],
        table: {
          title: "Stock ledger",
          columns: [
            { key: "product", label: "Product" },
            { key: "sku", label: "SKU" },
            { key: "warehouse", label: "Warehouse" },
            { key: "stock", label: "Stock", type: "number" },
            { key: "reorderPoint", label: "Reorder at", type: "number" }
          ],
          rows: rows.map((i) => ({ id: i.id, product: i.product.name, sku: i.product.sku, warehouse: i.warehouse, stock: i.stock, reorderPoint: i.reorderPoint, status: i.stock <= i.reorderPoint ? "low" : "healthy" })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [],
        widgets: [
          { title: "Immediate action", value: `${low.length} SKUs`, detail: "Below reorder point and ready for supplier PO.", tone: "rose" },
          { title: "Supplier concentration", value: "Balanced", detail: "No supplier exceeds 36% of tracked stock.", tone: "emerald" }
        ]
      };
    }
    case "projects": {
      const where = { organizationId, ...(status ? { status } : {}), ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}) };
      const [tasks, rows, total] = await Promise.all([
        prisma.task.findMany({ where: { organizationId }, include: { assignee: true } }),
        prisma.task.findMany({ where, include: { assignee: true }, orderBy: { dueDate: "asc" }, skip, take }),
        prisma.task.count({ where })
      ]);
      return {
        id: dashboard,
        title: "Project Delivery",
        description: "Task throughput, ownership, delivery risk, and sprint execution.",
        metrics: [
          { label: "Tasks", value: tasks.length, change: 11.2, tone: "sky" },
          { label: "Done", value: tasks.filter((t) => t.status === "done").length, change: 17.3, tone: "emerald" },
          { label: "In progress", value: tasks.filter((t) => t.status === "in-progress").length, change: 5.4, tone: "violet" },
          { label: "Blocked", value: tasks.filter((t) => t.status === "blocked").length, change: -2.6, tone: "rose" }
        ],
        charts: [
          { name: "Kanban status", type: "bar", xKey: "status", yKeys: ["tasks"], data: ["todo", "in-progress", "done", "blocked"].map((s) => ({ status: s, tasks: tasks.filter((t) => t.status === s).length })) },
          { name: "Priority mix", type: "pie", xKey: "priority", yKeys: ["count"], data: ["high", "medium", "low"].map((priority) => ({ priority, count: tasks.filter((t) => t.priority === priority).length })) }
        ],
        table: {
          title: "Delivery board",
          columns: [
            { key: "title", label: "Task" },
            { key: "project", label: "Project" },
            { key: "assignee", label: "Assignee" },
            { key: "priority", label: "Priority", type: "status" },
            { key: "status", label: "Status", type: "status" }
          ],
          rows: rows.map((t) => ({ id: t.id, title: t.title, project: t.project, assignee: t.assignee?.name ?? "Unassigned", priority: t.priority, status: t.status, dueDate: t.dueDate })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "status", label: "Task status", options: ["all", "todo", "in-progress", "done", "blocked"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Sprint health", value: "On track", detail: "Done rate is ahead of the current sprint midpoint.", tone: "emerald" },
          { title: "Capacity", value: "2 hot spots", detail: "High priority work is concentrated in platform.", tone: "amber" }
        ]
      };
    }
    case "marketing": {
      const channel = statusFilter(query.channel);
      const where = { organizationId, ...(channel ? { channel } : {}), ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) };
      const [campaigns, rows, total] = await Promise.all([
        prisma.campaign.findMany({ where: { organizationId } }),
        prisma.campaign.findMany({ where, orderBy: { launchedAt: "desc" }, skip, take }),
        prisma.campaign.count({ where })
      ]);
      return {
        id: dashboard,
        title: "Marketing Performance",
        description: "Campaign ROI, channel mix, conversion quality, and funnel efficiency.",
        metrics: [
          { label: "Spend", value: centsToCurrency(sum(campaigns, (c) => c.spendCents)), change: 8.1, tone: "amber" },
          { label: "Revenue", value: centsToCurrency(sum(campaigns, (c) => c.revenueCents)), change: 22.5, tone: "emerald" },
          { label: "Clicks", value: sum(campaigns, (c) => c.clicks), change: 13.7, tone: "sky" },
          { label: "CVR", value: `${percent(sum(campaigns, (c) => c.conversions), sum(campaigns, (c) => c.clicks))}%`, change: 3.9, tone: "violet" }
        ],
        charts: [
          { name: "Revenue by channel", type: "bar", xKey: "channel", yKeys: ["revenue"], data: ["Search", "Social", "Email", "Partner"].map((c) => ({ channel: c, revenue: centsToCurrency(sum(campaigns.filter((x) => x.channel === c), (x) => x.revenueCents)) })) },
          { name: "Click trend", type: "line", xKey: "month", yKeys: ["volume"], data: timeSeries(campaigns.map((c) => ({ launchedAt: c.launchedAt, revenueCents: c.revenueCents }))) }
        ],
        table: {
          title: "Campaign scorecard",
          columns: [
            { key: "name", label: "Campaign" },
            { key: "channel", label: "Channel" },
            { key: "clicks", label: "Clicks", type: "number" },
            { key: "conversions", label: "Conversions", type: "number" },
            { key: "roi", label: "ROI", type: "percent" }
          ],
          rows: rows.map((c) => ({ id: c.id, name: c.name, channel: c.channel, clicks: c.clicks, conversions: c.conversions, roi: percent(c.revenueCents - c.spendCents, c.spendCents) })),
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "channel", label: "Channel", options: ["all", "Search", "Social", "Email", "Partner"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Best channel", value: "Email", detail: "Highest conversion rate with lower acquisition cost.", tone: "emerald" },
          { title: "Budget shift", value: "+12% Search", detail: "Search is outperforming partner campaigns.", tone: "sky" }
        ]
      };
    }
    case "monitoring": {
      const level = statusFilter(query.level ?? query.status);
      const where = { organizationId, ...(level ? { level } : {}), ...(q ? { message: { contains: q, mode: "insensitive" as const } } : {}) };
      const [logs, rows, total] = await Promise.all([
        prisma.systemLog.findMany({ where: { organizationId } }),
        prisma.systemLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.systemLog.count({ where })
      ]);
      return {
        id: dashboard,
        title: "System Monitoring",
        description: "Service health, logs, latency, error trends, and incident signals.",
        metrics: [
          { label: "Uptime", value: "99.98%", change: 0.2, tone: "emerald" },
          { label: "Errors", value: logs.filter((l) => l.level === "error").length, change: -8.2, tone: "rose" },
          { label: "P95 latency", value: `${Math.max(...logs.map((l) => l.latencyMs), 0)}ms`, change: -4.5, tone: "sky" },
          { label: "Services", value: new Set(logs.map((l) => l.service)).size, change: 0, tone: "violet" }
        ],
        charts: [
          { name: "Log levels", type: "bar", xKey: "level", yKeys: ["count"], data: ["info", "warn", "error"].map((l) => ({ level: l, count: logs.filter((x) => x.level === l).length })) },
          { name: "Latency by service", type: "bar", xKey: "service", yKeys: ["latency"], data: ["api", "billing", "worker", "webhook"].map((service) => ({ service, latency: Math.round(sum(logs.filter((l) => l.service === service), (l) => l.latencyMs) / Math.max(logs.filter((l) => l.service === service).length, 1)) })) }
        ],
        table: {
          title: "Live logs",
          columns: [
            { key: "level", label: "Level", type: "status" },
            { key: "service", label: "Service" },
            { key: "message", label: "Message" },
            { key: "latencyMs", label: "Latency", type: "number" },
            { key: "createdAt", label: "Time", type: "date" }
          ],
          rows,
          pagination: pagination(page, pageSize, total)
        },
        filters: [
          { key: "level", label: "Level", options: ["all", "info", "warn", "error"].map((v) => ({ label: v, value: v })) }
        ],
        widgets: [
          { title: "Health", value: "Nominal", detail: "No critical incidents active.", tone: "emerald" },
          { title: "Trace sample", value: "Enabled", detail: "Slow requests are sampled at 100%.", tone: "violet" }
        ]
      };
    }
    case "crm": {
      const stage = statusFilter(query.stage ?? query.status);
      const where = { organizationId, ...(stage ? { stage } : {}), ...(q ? { company: { contains: q, mode: "insensitive" as const } } : {}) };
      const [leads, contacts, rows, total] = await Promise.all([
        prisma.lead.findMany({ where: { organizationId } }),
        prisma.contact.findMany({ where: { organizationId } }),
        prisma.lead.findMany({ where, orderBy: { valueCents: "desc" }, skip, take }),
        prisma.lead.count({ where })
      ]);
      return {
        id: dashboard,
        title: "CRM Pipeline",
        description: "Lead flow, contacts, deal stages, and forecast quality for sales teams.",
        metrics: [
          { label: "Pipeline", value: centsToCurrency(sum(leads, (l) => l.valueCents)), change: 16.8, tone: "emerald" },
          { label: "Leads", value: leads.length, change: 10.2, tone: "sky" },
          { label: "Contacts", value: contacts.length, change: 6.6, tone: "violet" },
          { label: "Win probability", value: `${Math.round(sum(leads, (l) => l.probability) / Math.max(leads.length, 1))}%`, change: 2.7, tone: "amber" }
        ],
        charts: [
          { name: "Deal pipeline", type: "bar", xKey: "stage", yKeys: ["value"], data: ["New", "Qualified", "Demo", "Proposal", "Negotiation"].map((s) => ({ stage: s, value: centsToCurrency(sum(leads.filter((l) => l.stage === s), (l) => l.valueCents)) })) },
          { name: "Lead sources", type: "pie", xKey: "source", yKeys: ["count"], data: ["Inbound", "Outbound", "Partner", "Event"].map((source) => ({ source, count: leads.filter((l) => l.source === source).length })) }
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
          { title: "Forecast", value: "Confident", detail: "Late-stage pipeline covers 78% of monthly target.", tone: "emerald" },
          { title: "Next best action", value: "Proposal follow-up", detail: "Three deals are waiting on legal review.", tone: "amber" }
        ]
      };
    }
    case "insights": {
      const category = statusFilter(query.category ?? query.status);
      const where = { organizationId, ...(category ? { category } : {}), ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}) };
      const [insights, rows, total, orders] = await Promise.all([
        prisma.insight.findMany({ where: { organizationId } }),
        prisma.insight.findMany({ where, orderBy: { impactScore: "desc" }, skip, take }),
        prisma.insight.count({ where }),
        prisma.order.findMany({ where: { organizationId } })
      ]);
      return {
        id: dashboard,
        title: "AI Insights",
        description: "Predictive recommendations, trend summaries, confidence scores, and action queues.",
        metrics: [
          { label: "Recommendations", value: insights.length, change: 21.1, tone: "violet" },
          { label: "Avg confidence", value: `${Math.round(sum(insights, (i) => i.confidence) / Math.max(insights.length, 1))}%`, change: 4.8, tone: "emerald" },
          { label: "Impact score", value: Math.round(sum(insights, (i) => i.impactScore) / Math.max(insights.length, 1)), change: 7.3, tone: "sky" },
          { label: "Revenue signal", value: centsToCurrency(sum(orders.slice(-8), (o) => o.totalCents)), change: 12.4, tone: "amber" }
        ],
        charts: [
          { name: "Insight impact", type: "bar", xKey: "category", yKeys: ["impact"], data: ["Revenue", "Retention", "Risk", "Ops"].map((category) => ({ category, impact: Math.round(sum(insights.filter((i) => i.category === category), (i) => i.impactScore) / Math.max(insights.filter((i) => i.category === category).length, 1)) })) },
          { name: "Predicted revenue", type: "line", xKey: "month", yKeys: ["revenue"], data: timeSeries(orders).map((row) => ({ ...row, revenue: Math.round(Number(row.revenue) * 1.12) })) }
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
          { title: "Trend summary", value: "Expansion likely", detail: "Recent order velocity implies stronger Q2 pipeline.", tone: "emerald" },
          { title: "Mock model", value: "Rules + scoring", detail: "Replace service logic with your ML endpoint when ready.", tone: "violet" }
        ]
      };
    }
  }
};
