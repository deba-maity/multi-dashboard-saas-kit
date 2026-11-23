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

test("reorder worksheet totals, warehouse selection and CSV agree", async ({ page }) => {
  await page.goto("./#/dashboards/inventory");
  await page.getByRole("button", { name: "Plan a reorder" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("24 units across 3 stock items")).toBeVisible();
  await dialog.getByRole("combobox").selectOption("East Hub");
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
  await expect(dialog.getByRole("alert")).toContainText("Enable browser storage");
  await page.keyboard.press("Escape");
  await expect(blocked.getByRole("button").first()).toBeVisible();
});
