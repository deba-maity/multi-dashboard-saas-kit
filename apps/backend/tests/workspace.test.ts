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
    users.push((await registered.json()).user.id);
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
    assert.equal((await request(path, tenant.accessToken, "PATCH", { ...body, status: "done" })).status, 409);
    const updated = await (await request("/dashboard-data/projects?status=blocked", tenant.accessToken)).json();
    assert.equal(updated.table.pagination.total, 0);
    assert.equal(updated.metrics.find((m: { label: string }) => m.label === "In progress").value, 1);
  });
  await t.test("combined member search and status stay applied", async () => {
    const query = "/dashboard-data/users?search=Report&status=";
    const active = await (await request(query + "active", tenant.accessToken)).json();
    const invited = await (await request(query + "invited", tenant.accessToken)).json();
    assert.equal(active.table.pagination.total, 0);
    assert.equal(invited.table.pagination.total, 1);
  });
  await t.test("a refreshed session still opens the same workspace and expires on logout", async () => {
    const body = { refreshToken: member.refreshToken };
    const response = await request("/auth/refresh", undefined, "POST", body);
    assert.equal(response.status, 200);
    const renewed = await response.json();
    const report = await (await request("/dashboard-data/projects", renewed.accessToken)).json();
    assert.equal(report.table.pagination.total, 1);
    assert.equal((await request("/auth/logout", undefined, "POST", body)).status, 204);
    assert.equal((await request("/auth/refresh", undefined, "POST", body)).status, 401);
  });
});
