import assert from "node:assert/strict";
import test from "node:test";
import { projectSummary } from "@saas-kit/shared";
import { analyticsWindow, orderSummary } from "../src/services/orderSummary.js";
import { pageArgs } from "../src/utils/http.js";

const order = (date: string, status: string, totalCents: number) => ({ createdAt: new Date(date), status, totalCents, channel: "Web" });
const anchor = new Date("2025-01-31T19:45:00Z");

test("30 complete UTC days include the start and exclude the end", () => {
  const w = analyticsWindow("30", anchor)!;
  assert.equal(w.start.toISOString(), "2025-01-01T00:00:00.000Z");
  const result = orderSummary([
    order("2024-12-31", "paid", 10000), order("2025-01-01", "paid", 12500),
    order("2025-01-30T23:59:59Z", "shipped", 7500), order("2025-01-31", "paid", 90000),
    order("2025-01-04", "pending", 500), order("2025-01-05", "refunded", 39000)
  ], w);
  assert.deepEqual(result.metrics.map((m) => m.value), [200, 4, 2, 100]);
  assert.equal(result.metrics[0].change, 100);
  assert.equal(result.charts[0].data.length, 30);
  assert.equal(result.charts[0].data[1].revenue, 0);
});

test("empty periods report zero without a fictitious change", () => {
  const result = orderSummary([], analyticsWindow("90", anchor));
  assert.ok(result.metrics.every((m) => m.value === 0 && m.change === undefined));
  assert.equal(result.widgets[0].value, "No booked orders");
});

test("full history separates years and keeps cents", () => {
  const result = orderSummary([order("2025-01-01", "paid", 199), order("2024-01-01", "paid", 100)], null);
  assert.deepEqual(result.charts[0].data.map((r) => r.period), ["Jan 2024", "Jan 2025"]);
  assert.equal(result.metrics[0].value, 2.99);
});

test("project metrics and charts use the same task statuses", () => {
  const tasks = [{ status: "blocked", priority: "high" }, { status: "done", priority: "low" }];
  tasks[0].status = "in-progress";
  const result = projectSummary(tasks);
  assert.deepEqual(result.metrics.map((m) => m.value), [2, 1, 1, 0]);
  assert.equal(result.charts[0].data.find((row) => row.status === "Blocked")?.tasks, 0);
  assert.equal(result.widgets[0].value, "50%");
});

test("pagination normalizes fractions and limits", () => {
  assert.deepEqual(pageArgs("2.4", "4.8"), { page: 2, pageSize: 4, skip: 4, take: 4 });
  assert.equal(pageArgs("Infinity", 200).pageSize, 50);
});
