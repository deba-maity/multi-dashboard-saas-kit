import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/config/prisma.js";
import { getDashboardData } from "../src/services/dashboardData.js";

const dashboardIds = [
  "analytics", "ecommerce", "users", "finance", "inventory",
  "projects", "marketing", "monitoring", "crm", "insights"
] as const;
const target = new URL("../../frontend/public/demo/", import.meta.url);

async function exportDemo() {
  if (process.env.PAGES_DEMO_SEED_DATABASE !== "1") {
    throw new Error("Use a dedicated database populated only with the repository's fictional seed data.");
  }
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: "northstar-labs" }
  });
  await mkdir(target, { recursive: true });
  const snapshots = dashboardIds.map((id) => ({ id, period: "" }));
  snapshots.push({ id: "analytics", period: "30" }, { id: "analytics", period: "90" });
  for (const { id, period } of snapshots) {
    const pageSize = 50;
    const result = await getDashboardData(id, organization.id, { page: 1, pageSize, period });
    const keys = ["id", ...result.table.columns.map(({ key }) => key)];
    const rows: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= result.table.pagination.pageCount; page++) {
      const current = page === 1 ? result : await getDashboardData(id, organization.id, { page, pageSize, period });
      for (const row of current.table.rows) {
        const fields = row as Record<string, unknown>;
        rows.push(Object.fromEntries(keys.map((key) => [key, fields[key]])));
      }
    }
    await writeFile(new URL((period ? id + "-" + period : id) + ".json", target), JSON.stringify({
      ...result,
      table: { ...result.table, rows, pagination: { page: 1, pageSize: Math.max(rows.length, 1), pageCount: 1, total: rows.length } }
    }) + "\n");
  }
}

exportDemo().finally(() => prisma.$disconnect()).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
