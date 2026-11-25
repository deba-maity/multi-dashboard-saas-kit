import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

test("authenticated workspace reporting and task workflow", async (t) => {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { app } = await import("../src/app.js");
  const { prisma } = await import("../src/config/prisma.js");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api";
  const users: string[] = [], tenants: string[] = [];
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await prisma.organization.deleteMany({ where: { id: { in: tenants } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    } finally { await prisma.$disconnect(); }
  });
  const run = randomUUID();
  const password = randomUUID();
  async function request(path: string, token?: string, method = "GET", body?: object) {
    return fetch(url + path, { method, headers: {
      "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {})
    }, body: body ? JSON.stringify(body) : undefined });
  }
  async function createTenant(label: string) {
    const email = label + "-" + run + "@example.test";
    const registered = await request("/auth/register", undefined, "POST", { name: label, email, password, organizationName: label });
    assert.equal(registered.status, 201);
    const registration = await registered.json();
    users.push(registration.user.id);
    assert.equal(registration.organization.name, label);
    const response = await request("/auth/login", undefined, "POST", { email, password });
    assert.equal(response.status, 200);
    const session = await response.json();
    tenants.push(session.organization.id);
    return session;
  }
  const tenant = await createTenant("North");
  const other = await createTenant("South");
  const email = "member-" + run + "@example.test";
  const memberResponse = await request("/users", tenant.accessToken, "POST", { name: "Report Member", email, password, role: "MEMBER" });
  assert.equal(memberResponse.status, 201);
  users.push((await memberResponse.json()).id);
  const memberQuery = "/dashboard-data/users?search=Report&status=";
  async function memberCount(status: string) {
    const data = await (await request(memberQuery + status, tenant.accessToken)).json();
    return data.table.pagination.total;
  }
  assert.equal(await memberCount("invited"), 1);
  assert.equal((await request("/auth/login", undefined, "POST", { email, password: randomUUID() })).status, 401);
  assert.equal(await memberCount("invited"), 1);
  const member = await (await request("/auth/login", undefined, "POST", { email, password })).json();
  const organizationId = tenant.organization.id;
  const task = await prisma.task.create({ data: {
    organizationId, title: "Review launch", project: "Delivery", priority: "high", status: "blocked", dueDate: new Date()
  } });
  for (const [status, totalCents] of [["paid", 100], ["paid", 1000], ["pending", 500]] as const) {
    await prisma.order.create({ data: { organizationId, customerName: "Example customer", status, totalCents, channel: "Web" } });
  }
  await t.test("period totals and sorting apply before pagination", async () => {
    const response = await request("/dashboard-data/analytics?status=paid&search=example&sort=total&direction=desc&pageSize=1", tenant.accessToken);
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.table.pagination.total, 2);
    assert.equal(report.table.rows[0].total, 10);
    assert.equal(report.metrics[0].value, 11);
    const empty = await (await request("/dashboard-data/analytics", other.accessToken)).json();
    assert.equal(empty.table.pagination.total, 0);
    assert.equal(empty.metrics[0].value, 0);
  });
  await t.test("the revenue scenario uses monthly booked cents and excludes other workspaces", async () => {
    const org = other.organization.id;
    const createdAt = new Date("2025-12-01T00:00:00Z");
    await prisma.order.createMany({ data: [
      {organizationId: org, createdAt, customerName: "A", totalCents: 1299, status: "paid", channel: "Web"},
      {organizationId: org, createdAt, customerName: "B", totalCents: 125, status: "shipped", channel: "Web"},
      {organizationId: org, createdAt, customerName: "C", totalCents: 9999, status: "pending", channel: "Web"},
      {organizationId: org, createdAt: new Date("2026-01-01T00:00:00Z"), customerName: "D", totalCents: 8888, status: "refunded", channel: "Web"}
    ] });
    const report = await (await request("/dashboard-data/insights", other.accessToken)).json();
    const data = report.charts.find((c: {kind: string}) => c.kind === "booked-revenue-scenario").data;
    assert.deepEqual(data, [{month: "Dec 2025", booked: 14.24, scenario: 15.95}, {month: "Jan 2026", booked: 0, scenario: 0}]);
  });
  await t.test("aging balances and invoice drill-downs agree across UTC day boundaries", async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const due = (age: number) => new Date(today.getTime() - age * 86400000 + 86399999);
    const ages = [-10, 0, 1, 30, 31, 60, 61, 90, 91];
    await prisma.invoice.createMany({ data: ages.map((age, index) => ({
      organizationId, invoiceNumber: "DUE-" + index, customerName: index % 2 ? "Blue" : "Amber",
      amountCents: 1000 + index, status: index % 2 ? "overdue" : "open", dueDate: due(age)
    })) });
    for (const [owner, status] of [[organizationId, "paid"], [organizationId, "void"], [other.organization.id, "open"]]) {
      await prisma.invoice.create({ data: { organizationId: owner, invoiceNumber: "OTHER-" + status, customerName: "Other",
        status, amountCents: 49999, dueDate: due(120) } });
    }
    const path = "/dashboard-data/finance";
    const finance = await (await request(path, member.accessToken)).json();
    const buckets = finance.charts.find((chart: {filterKey?: string}) => chart.filterKey === "aging").data;
    assert.deepEqual(buckets.map((row: {count: number}) => row.count), [2, 2, 2, 2, 1]);
    assert.deepEqual(buckets.map((row: {balance: number}) => Math.round(row.balance * 100)), [2001, 2005, 2009, 2013, 1008]);
    assert.equal(finance.metrics.find((m: {label: string}) => m.label === "Past-due invoices").value, 7);
    assert.equal(finance.metrics.find((m: {label: string}) => m.label === "Paid invoices").value, 1);
    const invoices = path + "?ledger=invoices";
    const pastDue = await (await request(invoices + "&aging=past-due", member.accessToken)).json();
    assert.equal(pastDue.table.pagination.total, 7);
    assert.ok(pastDue.table.rows.every((row: {daysPastDue: number}) => row.daysPastDue > 0));
    const unknownBand = await (await request(invoices + "&aging=retired-filter", member.accessToken)).json();
    assert.equal(unknownBand.table.pagination.total, 0);
    for (const [index, band] of ["current", "1-30", "31-60", "61-90", "91-plus"].entries()) {
      const r = await (await request(invoices + "&aging=" + band, member.accessToken)).json();
      assert.equal(r.table.pagination.total, buckets[index].count);
      assert.equal(r.table.rows.reduce((sum: number, row: {balance: number}) => sum + Math.round(row.balance * 100), 0),
        Math.round(buckets[index].balance * 100));
      assert.ok(r.table.rows.every((row: {aging: string}) => row.aging === band));
    }
    const page = await (await request(invoices + "&search=amber&pageSize=2&page=2&sort=balance&direction=desc", member.accessToken)).json();
    assert.equal(page.table.pagination.total, 5);
    assert.deepEqual(page.table.rows.map((row: {invoiceNumber: string}) => row.invoiceNumber), ["DUE-4", "DUE-2"]);
    const isolated = await (await request(invoices, other.accessToken)).json();
    assert.deepEqual(isolated.table.rows.map((row: {invoiceNumber: string}) => row.invoiceNumber), ["OTHER-open"]);
  });
  await t.test("service latency uses the event distribution and preserves level filters on the ledger", async () => {
    const logs = Array.from({length: 20}, (_, i) => ({ organizationId, service: "edge-API", level: i > 16 ? "error" : "info",
      message: "Edge request " + i, latencyMs: i === 19 ? 3000 : (i + 1) * 10 }));
    await prisma.systemLog.createMany({ data: [...logs,
      { organizationId, service: "all", level: "warn", message: "Live service named all", latencyMs: 42 },
      { organizationId: other.organization.id, service: "edge-API", level: "error", message: "Elsewhere", latencyMs: 9999 }] });
    const path = "/dashboard-data/monitoring";
    const overall = await (await request(path, member.accessToken)).json();
    assert.deepEqual(overall.metrics.map((m: {value: unknown}) => m.value), [21, 3, "190 ms", 2]);
    const scoped = await (await request(path + "?service=edge-API&level=error&sort=latencyMs&direction=desc&pageSize=1", member.accessToken)).json();
    assert.deepEqual(scoped.metrics.map((m: {value: unknown}) => m.value), [20, 3, "190 ms", 1]);
    assert.equal(scoped.table.pagination.total, 3);
    assert.equal(scoped.table.rows[0].latencyMs, 3000);
    assert.equal(scoped.widgets[0].value, "15%");
    assert.deepEqual(scoped.charts[1].data.find((s: {service: string}) => s.service === "edge-API"), {service: "edge-API", average: 245, p95: 190});
    const literal = await (await request(path + "?service=all", member.accessToken)).json();
    assert.equal(literal.table.pagination.total, 1);
    assert.equal(literal.table.rows[0].level, "warn");
    const missing = await (await request(path + "?service=retired", member.accessToken)).json();
    assert.deepEqual(missing.metrics.map((m: {value: unknown}) => m.value), [0, 0, "—", 0]);
  });
  await t.test("inventory totals span the workspace and the reorder preview stays bounded", async () => {
    for (let index = 0; index < 8; index++) {
      const stock = index;
      await prisma.product.create({ data: {
        organizationId, sku: "PACK-" + index, name: "Packing stock", category: "Shipping", priceCents: 200,
        inventoryItem: { create: { organizationId, warehouse: index % 2 ? "East" : "West",
          supplier: index < 4 ? "Fabric" : "Fiber", stock, reorderPoint: 6 } }
      } });
    }
    const path = "/dashboard-data/inventory?status=low&pageSize=2&page=3";
    const report = await (await request(path, member.accessToken)).json();
    assert.deepEqual(report.metrics.map((metric: { value: unknown }) => metric.value), [8, 28, 7, "4 units"]);
    assert.deepEqual(report.charts[0].data, [{ warehouse: "East", stock: 16 }, { warehouse: "West", stock: 12 }]);
    assert.equal(report.table.pagination.total, 7);
    assert.deepEqual(report.table.rows.map((row: { sku: string }) => row.sku), ["PACK-4", "PACK-5"]);
    assert.equal(report.widgets[0].detail, "PACK-0, PACK-1, PACK-2, PACK-3, PACK-4, and 2 more.");
    assert.equal(report.widgets[1].value, "2");
    const empty = await (await request(path, other.accessToken)).json();
    assert.deepEqual(empty.charts[0].data, []);
    assert.equal(empty.metrics[0].value, 0);
    assert.equal(empty.table.pagination.total, 0);
  });
  await t.test("campaign returns preserve zero spend, losses and the ranking across pages", async () => {
    for (const [name, spendCents, revenueCents] of [
      ["Organic 100%", 0, 555], ["Loss", 2000, 1600], ["Break even", 1000, 1000], ["Winner", 2500, 6250]
    ] as const) {
      await prisma.campaign.create({data: {organizationId, name, channel: "Email", clicks: 0, conversions: 0,
        spendCents, revenueCents, status: "active", launchedAt: new Date("2026-05-10T12:00:00Z")}});
    }
    const path = "/dashboard-data/marketing";
    const report = await (await request(path + "?sort=roi&direction=desc", member.accessToken)).json();
    assert.deepEqual(report.table.rows.map((r: {roi: number | null}) => r.roi), [150, 0, -20, null]);
    assert.deepEqual(report.metrics.map((m: {value: unknown}) => m.value), [55, 94.05, 0, "—"]);
    assert.equal(report.widgets[0].value, "71%");
    const low = await (await request(path + "/records?sort=roi&pageSize=2&page=2", member.accessToken)).json();
    assert.deepEqual(low.table.rows.map((r: {name: string}) => r.name), ["Winner", "Organic 100%"]);
    const exact = await (await request(path + "?search=%25&channel=Email", member.accessToken)).json();
    assert.equal(exact.table.pagination.total, 1);
    assert.equal(exact.table.rows[0].spend, 0);
    assert.equal(exact.table.rows[0].revenue, 5.55);
    assert.equal(exact.table.rows[0].roi, null);
    const empty = await (await request(path, other.accessToken)).json();
    assert.equal(empty.table.pagination.total, 0);
    assert.equal(empty.widgets[0].value, "—");
  });
  await t.test("bulk ledger pages match the report and retain its workspace and filter scope", async () => {
    for (const [dashboard, query] of [
      ["finance", "ledger=invoices&aging=past-due&sort=balance&direction=desc&pageSize=2&page=2"],
      ["finance", "status=paid"], ["monitoring", "service=edge-API&level=error&sort=latencyMs&direction=desc&pageSize=1&page=2"],
      ["inventory", "status=low&sort=sku&pageSize=2&page=2"], ["marketing", "channel=Email&sort=roi&direction=desc&pageSize=2&page=2"]
    ]) {
      const path = "/dashboard-data/" + dashboard;
      for (const auth of [member.accessToken, other.accessToken]) {
        const full = await (await request(path + "?" + query, auth)).json();
        const response = await request(path + "/records?" + query, auth);
        assert.equal(response.status, 200);
        const page = await response.json();
        assert.deepEqual(page.table, full.table);
        assert.ok(!("charts" in page) && !("metrics" in page));
      }
    }
  });
  await t.test("members can read tasks and admins can update the project summary", async () => {
    const report = await (await request("/dashboard-data/projects?status=blocked", member.accessToken)).json();
    assert.equal(report.table.rows[0].id, task.id);
    const lane = "/tasks?status=blocked&search=launch&pageSize=6";
    const mine = await (await request(lane, member.accessToken)).json();
    assert.equal(mine.rows[0].id, task.id);
    const separate = await (await request(lane, other.accessToken)).json();
    assert.equal(separate.pagination.total, 0);
    const path = "/tasks/" + task.id + "/status";
    const body = { previousStatus: "blocked", status: "in-progress" };
    assert.equal((await request(path, member.accessToken, "PATCH", body)).status, 403);
    assert.equal((await request(path, tenant.accessToken, "PATCH", body)).status, 204);
    assert.equal((await request(path, tenant.accessToken, "PATCH", body)).status, 204);
    const conflict = await request(path, tenant.accessToken, "PATCH", { ...body, status: "done" });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).details.currentStatus, "in-progress");
    const updated = await (await request("/dashboard-data/projects?status=blocked", tenant.accessToken)).json();
    assert.equal(updated.table.pagination.total, 0);
    assert.equal(updated.metrics.find((m: { label: string }) => m.label === "In progress").value, 1);
  });
  await t.test("a member's first successful sign-in clears their pending invitation", async () => {
    assert.equal(await memberCount("active"), 1);
    assert.equal(await memberCount("invited"), 0);
  });
  await t.test("report and task board searches match literal text and unassigned work", async () => {
    const title = "Review 20% off A_B\\\\V2";
    await prisma.task.create({ data: {
      organizationId, title, project: "Delivery", priority: "low", status: "todo", dueDate: new Date()
    } });
    for (const search of ["%", "_", "\\\\", "unsigned", "unasSiGn", "A_B"]) {
      const expected = search === "unsigned" ? 0 : search === "unasSiGn" ? 2 : 1;
      const query = "?search=" + encodeURIComponent(search);
      const report = await (await request("/dashboard-data/projects" + query, tenant.accessToken)).json();
      assert.equal(report.table.pagination.total, expected, search);
      const lane = await (await request("/tasks" + query + "&status=todo", tenant.accessToken)).json();
      assert.equal(lane.pagination.total, expected ? 1 : 0, search);
    }
    await prisma.order.create({ data: {
      organizationId, channel: "Web", status: "paid", customerName: "A_B Retail", totalCents: 700
    } });
    for (const id of ["analytics", "ecommerce"]) {
      const data = await (await request("/dashboard-data/" + id + "?search=_", tenant.accessToken)).json();
      assert.equal(data.table.pagination.total, 1);
      assert.equal(data.table.rows[0].customerName, "A_B Retail");
    }
  });
  await t.test("a refreshed session still opens the same workspace and expires on logout", async () => {
    const body = { refreshToken: member.refreshToken };
    const response = await request("/auth/refresh", undefined, "POST", body);
    assert.equal(response.status, 200);
    const renewed = await response.json();
    const report = await (await request("/dashboard-data/projects", renewed.accessToken)).json();
    assert.equal(report.table.pagination.total, 2);
    assert.equal((await request("/auth/logout", undefined, "POST", body)).status, 204);
    assert.equal((await request("/auth/refresh", undefined, "POST", body)).status, 401);
  });
});
