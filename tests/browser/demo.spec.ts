import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("all ten dashboards render on a phone without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  for (const id of ["analytics", "ecommerce", "users", "finance", "inventory", "projects", "marketing", "monitoring", "crm", "insights"]) {
    await page.getByLabel("Dashboard navigation").selectOption(id);
    await expect(page.locator("#report-table tbody tr").first()).toBeVisible();
    expect(await page.getByLabel("Dashboard navigation").inputValue()).toBe(id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: /^View data for/ }).first().click();
    await expect(page.locator("table caption").first()).toBeAttached();
  }
  expect(errors).toEqual([]);
});

test("long inventory codes wrap on a phone and the worksheet scrolls inside its dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sku = "SHIP-" + "X".repeat(75);
  await page.route("**/demo/inventory.json", async (route) => {
    const response = await route.fetch();
    const report = await response.json();
    const low = report.table.rows.find((row: { status: string }) => row.status === "low");
    low.sku = sku;
    report.widgets[0].detail = sku + ", and 6 more.";
    await route.fulfill({ response, json: report });
  });
  await page.goto("./#/dashboards/inventory");
  await expect(page.getByText(sku + ", and 6 more.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Plan a reorder" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("cell", { name: sku, exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Warehouse", { exact: true })).toBeVisible();
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test("a blocked task can be updated, reopened after reload and reset", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Review blocked tasks" }).click();
  const rows = page.locator("#report-table tbody tr");
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  const title = await rows.first().getByRole("button").innerText();
  await rows.first().getByRole("button").click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("in-progress");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rows).toHaveCount(before - 1);
  await page.reload();
  await expect(rows).toHaveCount(before - 1);
  await expect(page.locator("article").filter({ hasText: "Needs attention" })).toContainText((before - 1) + " blocked");
  await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("in-progress");
  await expect(rows.filter({ hasText: title }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reset sample tasks" }).click();
  await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("blocked");
  await expect(rows).toHaveCount(before);
});

test("reporting period, filtered CSV and record links survive a reload", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "30 days" }).click();
  await expect(page.getByText(/vs previous period/)).toBeVisible();
  await page.getByRole("combobox", { name: "Order status", exact: true }).selectOption("paid");
  await expect(page.locator("#report-table tbody tr").first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Order status", exact: true })).toHaveValue("paid");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("northstar-analytics.csv");
  const csv = await readFile((await download.path())!, "utf8");
  const lines = csv.trim().split(/\r?\n/);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.slice(1).every((line) => line.includes('"paid"'))).toBe(true);
  await page.getByLabel("Search records", { exact: true }).fill("no sample order matches this");
  await expect(page.getByText("No matching records")).toBeVisible();
  await page.getByRole("button", { name: "Show all records" }).click();
  await expect(page.locator("#report-table tbody tr").first()).toBeVisible();
});

test("global sort spans pages and CSV contains the entire result", async ({ page, request }) => {
  const snapshot = await (await request.get("demo/analytics.json")).json();
  const amounts: number[] = snapshot.table.rows.map((row: { total: number }) => row.total).sort((a: number, b: number) => a - b);
  await page.goto("./#/dashboards/analytics");
  await page.getByRole("button", { name: "Order total", exact: true }).click();
  const priceCells = page.locator("#report-table tbody tr td:nth-child(4)");
  await expect(priceCells.first()).toHaveText("$" + amounts[0].toLocaleString("en-US"));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(priceCells.first()).toHaveText("$" + amounts[10].toLocaleString("en-US"));
  const nextDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const path = await (await nextDownload).path();
  const exported = (await readFile(path!, "utf8")).trim().split(/\r?\n/).slice(1);
  expect(exported).toHaveLength(amounts.length);
  await page.getByRole("button", { name: "Find dashboard", exact: true }).click();
  await page.getByLabel("Find by name or topic").fill("latency");
  await page.getByLabel("Find by name or topic").press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("System Monitoring");
});

test("chart drill-down and a named view restore the same stock filter", async ({ page }) => {
  await page.goto("./#/dashboards/inventory");
  await page.getByRole("button", { name: "Warehouse", exact: true }).click();
  await expect(page.locator("#report-table tbody tr").first().locator("td").nth(2)).toHaveText("EU 3PL");
  await page.getByRole("button", { name: "Show records for Low" }).click();
  const filter = page.getByRole("combobox", { name: "Stock health" });
  await expect(filter).toHaveValue("low");
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page.getByLabel("View name").fill("Reorder list");
  await page.getByRole("button", { name: "Save report view", exact: true }).click();
  await filter.selectOption("healthy");
  await page.reload();
  await page.getByRole("button", { name: "Reorder list", exact: true }).click();
  await expect(filter).toHaveValue("low");
  await expect(page.locator("#report-table tbody tr").first()).toContainText("Low");
  await page.getByRole("button", { name: "Remove saved view Reorder list" }).click();
  await expect(page.getByRole("button", { name: "Reorder list", exact: true })).toHaveCount(0);
});

test("project board updates both lanes and restores a shared board link", async ({ page }) => {
  await page.goto("./#/dashboards/projects");
  await page.getByRole("button", { name: "Task board", exact: true }).click();
  const blocked = page.getByRole("region", { name: "Blocked tasks", exact: true });
  const progress = page.getByRole("region", { name: "In progress tasks", exact: true });
  const count = blocked.getByRole("heading").locator("span");
  const otherCount = progress.getByRole("heading").locator("span");
  await expect(count).toHaveText(/^\d+$/);
  await expect(otherCount).toHaveText(/^\d+$/);
  const before = Number(await count.innerText());
  const other = Number(await otherCount.innerText());
  await blocked.getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("in-progress");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(count).toHaveText(String(before - 1));
  await expect(otherCount).toHaveText(String(other + 1));
  await page.reload();
  await expect(count).toHaveText(String(before - 1));
  await page.getByRole("searchbox", {name:"Find tasks"}).fill("impossible search term");
  await expect(page.getByText("No matching tasks")).toHaveCount(4);
});

test("a browser with storage blocked can move sample tasks and keep views for this tab", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage full", "QuotaExceededError"); };
    Storage.prototype.removeItem = () => { throw new DOMException("Storage unavailable", "SecurityError"); };
  });
  await page.goto("./#/dashboards/projects?layout=board");
  const blocked = page.getByRole("region", { name: "Blocked tasks", exact: true });
  const count = blocked.getByRole("heading").locator("span");
  await expect(count).toHaveText(/^\d+$/);
  const original = Number(await count.innerText());
  await blocked.getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("in-progress");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(count).toHaveText(String(original - 1));
  await expect(page.getByText("Task updated for this tab")).toBeVisible();
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page.getByLabel("View name").fill("My board");
  await page.getByRole("button", { name: "Save report view", exact: true }).click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page.getByRole("button", { name: "My board", exact: true }).click();
  await expect(count).toHaveText(String(original - 1));
  await page.getByRole("button", { name: "Reset sample tasks" }).click();
  await expect(count).toHaveText(String(original));
  await page.reload();
  await expect(count).toHaveText(String(original));
  await expect(page.getByRole("button", { name: "My board", exact: true })).toHaveCount(0);
});

test("reorder worksheet totals, warehouse selection and CSV agree", async ({ page }) => {
  await page.goto("./#/dashboards/inventory");
  await page.getByRole("button", { name: "Plan a reorder" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("24 units across 3 stock items")).toBeVisible();
  await expect(dialog.getByRole("columnheader", { name: "Warehouse" })).toBeVisible();
  await dialog.getByRole("combobox").selectOption("East Hub");
  await expect(dialog.getByRole("cell", { name: "East Hub", exact: true })).toBeVisible();
  await dialog.getByLabel("Extra units per SKU").fill("10");
  await expect(dialog.getByText("14 units across 1 stock item")).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", {name: "Download draft CSV"}).click();
  expect(await readFile((await (await download).path())!, "utf8")).toContain('"PULSE-SEAT","East Hub","18","22","32","14"');
  await dialog.getByLabel("Extra units per SKU").fill("0");
  await expect(dialog.getByRole("button", {name:"Download draft CSV"})).toBeDisabled();
});

test("a saved task board restores its layout and search from the report", async ({page}) => {
  await page.goto("./#/dashboards/projects?layout=board");
  await page.getByRole("searchbox", {name: "Find tasks"}).fill("review");
  await page.getByRole("button", {name: "Save view", exact: true}).click();
  await page.getByLabel("View name").fill("Review board");
  await page.getByRole("button", {name: "Save report view"}).click();
  await page.getByRole("button", {name: "Report", exact: true}).click();
  await page.getByRole("button", {name: "Review board", exact: true}).click();
  await expect(page.getByRole("region", {name: "Task board", exact: true})).toBeVisible();
  await expect(page.getByRole("searchbox", {name: "Find tasks"})).toHaveValue("review");
});

test("the demo stays readable when browser storage is disabled", async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", {
    get() { throw new DOMException("Storage disabled", "SecurityError"); }
  }));
  await page.goto("./#/dashboards/projects?layout=board");
  const blocked = page.getByRole("region", {name: "Blocked tasks"});
  await blocked.getByRole("button").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").selectOption("done");
  await dialog.getByRole("button", {name: "Save status"}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Task updated for this tab")).toBeVisible();
  await expect(blocked.getByRole("button").first()).toBeVisible();
});

test("saved views appear and disappear in other open tabs", async ({ page, context }) => {
  const other = await context.newPage();
  await Promise.all([page, other].map((tab) => tab.goto("./#/dashboards/inventory?status=low")));
  await page.bringToFront();
  await expect(other.getByRole("button", { name: "Save view", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page.getByLabel("View name").fill("Warehouse round");
  await page.getByRole("button", { name: "Save report view" }).click();
  await other.bringToFront();
  await other.getByRole("button", { name: "Remove saved view Warehouse round" }).click({ timeout: 5000 });
  await page.bringToFront();
  await expect(page.getByRole("button", { name: "Warehouse round", exact: true })).toHaveCount(0);
});

test("switching project layouts keeps the report filter and sort", async ({ page }) => {
  await page.goto("./#/dashboards/projects?status=blocked&sort=title&direction=desc");
  await page.getByRole("button", { name: "Task board", exact: true }).click();
  await expect(page.getByRole("region", { name: "To do tasks", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Task status", exact: true })).toHaveValue("blocked");
  await expect(page.locator("#report-table tr th[aria-sort=descending]")).toContainText("Task");
});

test.describe("UTC accounting dates", () => {
  test.use({ timezoneId: "Pacific/Kiritimati" });
  test("the displayed ledger date agrees with the reporting window and export", async ({ page, request }) => {
    const snapshot = await (await request.get("demo/analytics-30.json")).json();
    const date = new Date(snapshot.table.rows[0].createdAt);
    const expected = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
    await page.goto("./#/dashboards/analytics?period=30");
    const first = page.locator("#report-table tbody tr").first();
    await expect(first.locator("td").last()).toHaveText(expected);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const csv = await readFile((await (await downloading).path())!, "utf8");
    expect(csv.split(/\r?\n/)[1]).toContain(date.toISOString());
    await first.getByRole("button").click();
    await expect(page.getByRole("dialog")).toContainText(expected);
  });
});

test("two editors resolve conflicting changes to a task inside the open dialog", async ({ page, context }) => {
  const other = await context.newPage();
  const tabs = [page, other];
  for (const tab of tabs) {
    await tab.goto("./#/dashboards/projects?status=blocked");
    await tab.locator("#report-table tbody tr").first().getByRole("button").click();
  }
  const first = page.getByRole("dialog"), second = other.getByRole("dialog");
  await first.getByRole("combobox").selectOption("done");
  await first.getByRole("button", { name: "Save status" }).click();
  await expect(first).toHaveCount(0);
  await second.getByRole("combobox").selectOption("todo");
  await second.getByRole("button", { name: "Save status" }).click();
  await expect(second.getByRole("alert")).toContainText("moved this task to Done");
  await expect(second.getByRole("combobox")).toHaveValue("done");
  await expect(second.getByRole("button", { name: "Save status" })).toBeDisabled();
  await second.getByRole("combobox").selectOption("in-progress");
  await second.getByRole("button", { name: "Save status" }).click();
  await expect(second).toHaveCount(0);
});

test("single-month series render an actual point and empty pie charts explain the empty state", async ({ page }) => {
  await page.route("**/demo/finance.json", async (route) => {
    const response = await route.fetch();
    const report = await response.json();
    report.charts[0].data = [{ month: "Nov 2026", revenue: 125 }];
    await route.fulfill({ response, json: report });
  });
  await page.goto("./#/dashboards/finance");
  await expect(page.locator(".recharts-line-dot")).toHaveCount(1);
  await page.route("**/demo/users.json", async (route) => {
    const response = await route.fetch();
    const report = await response.json();
    report.charts[1].data.forEach((row: { count: number }) => { row.count = 0; });
    await route.fulfill({ response, json: report });
  });
  await page.goto("./#/dashboards/users");
  await expect(page.getByText("No data for this period")).toBeVisible();
  await page.getByRole("button", { name: "View data for Activity status" }).click();
  await expect(page.getByRole("table", { name: "Activity status" }).getByRole("row")).toHaveCount(4);
});

test("aging chart, invoice detail, saved view and CSV agree after switching ledgers", async ({page, request}) => {
  const snapshot = await (await request.get("./demo/finance-invoices.json")).json();
  const expected = snapshot.table.rows.filter((row: {aging: string}) => row.aging === "31-60");
  expect(expected.length).toBeGreaterThan(0);
  await page.goto("./#/dashboards/finance?status=failed&sort=amount&direction=desc");
  await page.getByRole("button", {name: "Show records for 31–60 days"}).click();
  const ledger = page.getByRole("region", {name: "Outstanding invoices", exact: true});
  await expect(ledger.getByLabel("Invoice age")).toHaveValue("31-60");
  expect(page.url()).not.toContain("status=failed");
  expect(page.url()).not.toContain("sort=amount");
  await expect(ledger.locator("tbody tr")).toHaveCount(expected.length);
  await ledger.getByRole("button", {name: expected[0].invoiceNumber}).click();
  await expect(page.getByRole("dialog")).toContainText(expected[0].customerName);
  await page.getByRole("button", {name: "Close dialog"}).click();
  await page.getByRole("button", {name: "Save view", exact: true}).click();
  await page.getByLabel("View name").fill("Collections");
  await page.getByRole("button", {name: "Save report view", exact: true}).click();
  await page.getByRole("button", {name: "Transactions", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Transaction ledger"})).toBeVisible();
  await page.getByRole("button", {name: "Collections", exact: true}).click();
  await page.reload();
  await expect(ledger.getByLabel("Invoice age")).toHaveValue("31-60");
  const download = page.waitForEvent("download");
  await ledger.getByRole("button", {name: "Export CSV"}).click();
  const csv = await download;
  expect(csv.suggestedFilename()).toBe("northstar-outstanding-invoices.csv");
  const text = await readFile((await csv.path())!, "utf8");
  expect(text.trim().split(/\r?\n/)).toHaveLength(expected.length + 1);
  for (const row of expected) expect(text).toContain('"' + row.invoiceNumber + '"');
  await ledger.getByLabel("Search records").fill(expected[0].invoiceNumber);
  await expect(ledger.locator("tbody tr")).toHaveCount(1);
});

test("service latency drill-down, severity, reload and export keep the selected service", async ({page, request}) => {
  const report = await (await request.get("./demo/monitoring.json")).json();
  const firstError = report.table.rows.find((r: {level: string}) => r.level === "error");
  const service = firstError.service;
  const events = report.table.rows.filter((r: {service: string}) => r.service === service);
  const errors = events.filter((r: {level: string}) => r.level === "error");
  const latencies = events.map((r: {latencyMs: number}) => r.latencyMs).sort((a: number, b: number) => a - b);
  await page.goto("./#/dashboards/monitoring");
  await page.getByRole("button", {name: "Show records for " + service, exact: true}).click();
  const ledger = page.getByRole("region", {name: "Event log", exact: true});
  await expect(ledger.getByLabel("Service", {exact: true})).toHaveValue(service);
  await expect(page.getByText("Event metrics for " + service, {exact: true})).toBeVisible();
  await expect(page.getByText(latencies[Math.ceil(latencies.length * .95) - 1] + " ms", {exact: true})).toBeVisible();
  await ledger.getByLabel("Level", {exact: true}).selectOption("error");
  await page.reload();
  await expect(ledger.getByLabel("Level", {exact: true})).toHaveValue("error");
  await expect(ledger.locator("tbody tr")).toHaveCount(Math.min(10, errors.length));
  const dl = page.waitForEvent("download");
  await ledger.getByRole("button", {name: "Export CSV"}).click();
  const text = await readFile((await (await dl).path())!, "utf8");
  expect(text.trim().split(/\r?\n/)).toHaveLength(errors.length + 1);
  for (const record of errors) expect(text).toContain(record.message);
  await page.getByRole("button", {name: "Show all services"}).click();
  await expect(ledger.getByLabel("Service", {exact: true})).toHaveValue("");
  await expect(ledger.getByLabel("Level", {exact: true})).toHaveValue("error");
});

test("the scenario starts from Analytics revenue and its assumption, totals and CSV agree", async ({page, request}) => {
  const baseline = await (await request.get("./demo/analytics.json")).json();
  const months = baseline.charts[0].data;
  await page.goto("./#/dashboards/insights?scenario=-25");
  const slider = page.getByRole("slider", {name: "Change from booked revenue"});
  await expect(slider).toHaveValue("-25");
  await page.getByRole("button", {name: "View data for Booked revenue scenario"}).click();
  const table = page.getByRole("table", {name: "Booked revenue scenario"});
  await expect(table.locator("tbody tr")).toHaveCount(months.length);
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Export scenario CSV"}).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("northstar-revenue-scenario.csv");
  const lines = (await readFile((await file.path())!, "utf8")).trim().split(/\r?\n/).slice(1);
  expect(lines).toEqual(months.map((m: {period: string; revenue: number}) =>
    [m.period, m.revenue, -25, Math.round(Math.round(m.revenue * 100) * .75) / 100].map(v => '"' + v + '"').join(",")));
  await slider.press("Home");
  await expect(slider).toHaveValue("-100");
  await expect(page).toHaveURL(/scenario=-100/);
  for (const cell of await table.locator("tbody tr td:last-child").allTextContents()) expect(cell).toBe("$0");
  await page.reload();
  await expect(slider).toHaveValue("-100");
  await page.getByRole("button", {name: "Reset to +12%"}).click();
  await expect(slider).toHaveValue("12");
  expect(page.url()).not.toContain("scenario=");
  await page.goto("./#/dashboards/insights?scenario=not-a-number");
  await expect(slider).toHaveValue("12");
});

test("keyboard report search opens the collections ledger and respects an open record", async ({page}) => {
  await page.goto("./");
  await expect(page.getByRole("heading", {name: "Revenue overview"})).toBeVisible();
  await page.keyboard.press("Control+k");
  const finder = page.getByRole("combobox", {name: "Find by name or topic"});
  await finder.fill("invoice overdue");
  await expect(page.getByRole("option", {name: "Past-due invoices"})).toHaveAttribute("aria-selected", "true");
  await finder.press("Enter");
  const ledger = page.getByRole("region", {name: "Outstanding invoices", exact: true});
  await expect(ledger.getByLabel("Invoice age")).toHaveValue("past-due");
  await expect(ledger).toBeInViewport();
  await ledger.locator("tbody button").first().click();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("combobox", {name: "Find by name or topic"})).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await finder.fill("revenue");
  await finder.press("ArrowDown");
  await expect(page.getByRole("listbox", {name: "Matching dashboards and reports"}).getByRole("option", {selected: true})).toHaveText("Analytics");
  await finder.fill("what if");
  await finder.press("Enter");
  await expect(page.getByRole("slider", {name: "Change from booked revenue"})).toBeInViewport();
});

test("a failed sample response can be retried without reloading the application", async ({page}) => {
  let valid = false;
  await page.route("**/demo/finance-invoices.json", async (route) => {
    if (valid) await route.continue();
    else await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({message: "temporary response"})});
  });
  await page.goto("./#/dashboards/finance?ledger=invoices");
  await expect(page.getByRole("alert")).toContainText("The report could not be read");
  valid = true;
  await page.getByRole("button", {name: "Retry", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Outstanding invoices"})).toBeVisible();
});

test("clicking an aging bar opens its invoices and the overdue metric opens all past-due bands", async ({page, request}) => {
  const report = await (await request.get("./demo/finance-invoices.json")).json();
  const expected = report.table.rows.filter((r: {aging: string}) => r.aging === "31-60");
  await page.goto("./#/dashboards/finance");
  const chart = page.getByRole("heading", {name:"Outstanding balance by age"}).locator("../..");
  await chart.locator(".recharts-bar-rectangle path").nth(2).click();
  const ledger = page.getByRole("region", {name: "Outstanding invoices", exact: true});
  await expect(ledger.getByLabel("Invoice age")).toHaveValue("31-60");
  await expect(ledger.locator("tbody tr")).toHaveCount(expected.length);
  await page.getByRole("button", {name: "Review past-due invoices"}).click();
  await expect(ledger.getByLabel("Invoice age")).toHaveValue("past-due");
});

test("a long saved-view name and its remove button stay usable on a narrow phone", async ({page}) => {
  await page.setViewportSize({width: 320, height: 720});
  await page.goto("./#/dashboards/finance?ledger=invoices");
  await page.getByRole("button", {name:"Save view", exact:true}).click();
  const name = "W".repeat(40);
  await page.getByLabel("View name").fill(name);
  await page.getByRole("button", {name:"Save report view",exact:true}).click();
  const remove = page.getByRole("button", {name:"Remove saved view " + name});
  const box = await remove.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await remove.click();
  await expect(remove).toHaveCount(0);
});

test("export refuses a ledger that repeats a record on a later page", async ({page}) => {
  await page.route("**/demo/finance-invoices.json", async route => {
    const response = await route.fetch();
    const report = await response.json();
    const original = report.table.rows[0];
    report.table.rows = Array.from({length: 55}, (_, i) => ({...original, id: "invoice-" + (i === 53 ? 2 : i), invoiceNumber: "INV-" + i}));
    await route.fulfill({response, json:report});
  });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.goto("./#/dashboards/finance?ledger=invoices");
  await page.getByRole("button", {name: "Export CSV", exact: true}).click();
  await expect(page.getByText("The records changed while loading. Please try again.")).toBeVisible();
  expect(downloads).toBe(0);
});

test("unknown historical period links show the all-time report without a comparison", async ({page}) => {
  await page.goto("./#/dashboards/analytics?period=all");
  await expect(page.getByRole("button", {name:"All time",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByText("All recorded orders", {exact:true})).toBeVisible();
  await expect(page.getByText(/vs previous period/)).toHaveCount(0);
});

test("campaign returns rank both directions and distinguish no spend from break-even", async ({page}) => {
  await page.route("**/demo/marketing.json", async (route) => {
    const response = await route.fetch();
    const report = await response.json();
    const [first, second, third] = report.table.rows;
    report.table.rows = [
      {...first, name: "Organic referral", channel: "Email", spend: 0, revenue: 50, roi: null},
      {...second, name: "Break-even launch", channel: "Email", spend: 25, revenue: 25, roi: 0},
      {...third, name: "Paid launch", channel: "Email", spend: 25, revenue: 75, roi: 200}
    ];
    await route.fulfill({ response, json: report });
  });
  await page.goto("./");
  await expect(page.getByRole("heading", {name: "Revenue overview"})).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", {name: "Find by name or topic"}).fill("roi");
  await page.keyboard.press("Enter");
  const rows = page.locator("#report-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Paid launch");
  await expect(rows.last().getByRole("cell").last()).toHaveText("—");
  const sorted = page.getByRole("button", {name: "ROI", exact: true});
  await sorted.click();
  await expect(rows.first()).toContainText("Break-even launch");
  await expect(rows.first().getByRole("cell").last()).toHaveText("0%");
  await expect(rows.last()).toContainText("Organic referral");
  await rows.last().getByRole("button").click();
  const dialog = page.getByRole("dialog", {name: "Organic referral"});
  await expect(dialog).toContainText("Spend$0");
  await expect(dialog).toContainText("Revenue$50");
  await dialog.getByRole("button", {name: "Close dialog"}).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", {name: "Export CSV", exact: true}).click();
  const csv = await readFile((await (await downloading).path())!, "utf8");
  expect(csv).toContain('"Spend","Revenue","ROI"');
  expect(csv.trim().split(/\r?\n/).at(-1)).toMatch(/"0","50",""$/);
});

test("long service names fit the phone filter and remain reachable beyond the chart's top eight", async ({page}) => {
  await page.setViewportSize({width: 320, height: 740});
  const names = Array.from({length: 12}, (_, i) => i === 11 ? "edge-" + "regional".repeat(14) : "service-" + i);
  await page.route("**/demo/monitoring.json", async (route) => {
    const response = await route.fetch();
    const report = await response.json();
    const chart = report.charts.find((item: {filterKey: string}) => item.filterKey === "service");
    chart.data = names.map((service, i) => ({service, average: i, p95: 100 + i}));
    const filter = report.filters.find((item: {key: string}) => item.key === "service");
    filter.options = [filter.options[0], ...names.map(value => ({label: value, value}))];
    report.table.rows = names.map((service, i) => ({...report.table.rows[0], id: "m" + i, service, message: "Event " + i}));
    await route.fulfill({response, json: report});
  });
  await page.goto("./#/dashboards/monitoring");
  const chart = page.getByRole("heading", {name: "Latency across services"}).locator("../..");
  await expect(chart.getByRole("button", {name: /^Show records for/})).toHaveCount(8);
  await chart.getByRole("button", {name: "View data for Latency across services"}).click();
  await expect(chart.getByRole("button", {name: /^Show records for/})).toHaveCount(12);
  await chart.getByRole("button", {name: "Show records for service-0", exact: true}).click();
  const select = page.getByLabel("Service", {exact: true});
  await expect(select).toHaveValue(names[0]);
  await select.selectOption(names[11]);
  await expect(page.getByRole("button", {name: "Event 11"})).toBeVisible();
  const bounds = (await select.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("a saved dark theme is applied while the application bundle is still unavailable", async ({page}) => {
  await page.goto("./");
  await page.getByRole("button", {name: "Toggle theme"}).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const scripts = "**/*";
  await page.route(scripts, (route) => route.request().resourceType() === "script" ? route.abort() : route.continue());
  await page.reload({waitUntil: "load"});
  await expect(page.locator("#root")).toBeEmpty();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await page.unroute(scripts);
  await page.reload();
  await page.getByRole("button", {name: "Toggle theme"}).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("sample records stay filterable and exportable after losing the connection", async ({page, context}) => {
  await page.goto("./#/dashboards/finance?ledger=invoices");
  const ledger = page.getByRole("region", {name: "Outstanding invoices", exact: true});
  await expect(ledger.locator("tbody tr").first()).toBeVisible();
  await context.setOffline(true);
  try {
    await ledger.getByLabel("Invoice age").selectOption("past-due");
    await expect(ledger).toContainText("of 10 records");
    const downloading = page.waitForEvent("download");
    await ledger.getByRole("button", {name: "Export CSV", exact: true}).click();
    const csv = await readFile((await (await downloading).path())!, "utf8");
    expect(csv.trim().split(/\r?\n/)).toHaveLength(11);
    await page.getByRole("link", {name: "Marketing", exact: true}).click();
    await expect(page.getByRole("alert")).toContainText("Reconnect to load this sample report");
  } finally {
    await context.setOffline(false);
  }
  await page.getByRole("button", {name: "Retry", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Marketing Performance"})).toBeVisible();
});
