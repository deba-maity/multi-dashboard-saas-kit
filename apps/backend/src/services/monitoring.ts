import type { Prisma } from "@prisma/client";
import { monitoringSummary, type DashboardResponse } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { containsText, pageArgs, pagination, reportOrder } from "../utils/http.js";

type ServiceStats = {
  service: string | null; total: bigint; errors: bigint; warnings: bigint; info: bigint; average: number | null; p95: number | null;
};

export async function getMonitoringLedger(organizationId: string, query: Record<string, unknown>): Promise<DashboardResponse["table"]> {
  const { page, pageSize, take, skip } = pageArgs(query.page, query.pageSize);
  const service = typeof query.service === "string" ? query.service : "";
  const level = query.level ?? query.status;
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const match = containsText(search);
  const where: Prisma.SystemLogWhereInput = { organizationId,
    ...(service && { service }), ...(typeof level === "string" && level && level !== "all" && { level }),
    ...(search && { OR: [{ message: match }, { service: match }] })
  };
  const direction = query.direction === "desc" ? "desc" : "asc";
  const sorts: Record<string, Prisma.SystemLogOrderByWithRelationInput> = {
    level: { level: direction }, service: { service: direction }, message: { message: direction },
    latencyMs: { latencyMs: direction }, createdAt: { createdAt: direction }
  };
  const [rows, total] = await Promise.all([
    prisma.systemLog.findMany({ where, orderBy: reportOrder<Prisma.SystemLogOrderByWithRelationInput>(query.sort, sorts, { createdAt: "desc" }, { id: "asc" }), skip, take }),
    prisma.systemLog.count({ where })
  ]);
  return {
    title: "Event log", recordKey: "message",
    columns: [
      { key: "level", label: "Level", type: "status" }, { key: "service", label: "Service" },
      { key: "message", label: "Message" }, { key: "latencyMs", label: "Latency (ms)", type: "number" },
      { key: "createdAt", label: "Time", type: "datetime" }
    ], rows, pagination: pagination(page, pageSize, total)
  };
}

export async function getMonitoringData(organizationId: string, query: Record<string, unknown>): Promise<DashboardResponse> {
  const service = typeof query.service === "string" ? query.service : "";
  const [groups, table] = await Promise.all([
    prisma.$queryRaw<ServiceStats[]>`
      SELECT service, count(*) AS total, count(*) FILTER (WHERE level = 'error') AS errors,
        count(*) FILTER (WHERE level = 'warn') AS warnings, count(*) FILTER (WHERE level = 'info') AS info,
        round(avg("latencyMs"))::integer AS average,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
      FROM "SystemLog" WHERE "organizationId" = ${organizationId}
      GROUP BY GROUPING SETS ((), (service)) ORDER BY service`,
    getMonitoringLedger(organizationId, query)
  ]);
  const services = groups.filter((row): row is ServiceStats & {service: string} => row.service !== null);
  const selected = groups.find((row) => row.service === (service || null));
  const { levels, ...overview } = monitoringSummary({
    total: Number(selected?.total ?? 0), errors: Number(selected?.errors ?? 0), warnings: Number(selected?.warnings ?? 0),
    info: Number(selected?.info ?? 0), p95: selected?.p95 ?? null
  }, service ? Number(!!selected) : services.length, service);
  const names = services.map((row) => row.service);
  if (service && !names.includes(service)) names.push(service);
  return {
    id: "monitoring", title: "System Monitoring",
    description: "Compare average and tail latency, then inspect the events for a service.", ...overview,
    charts: [levels, { name: "Latency across services", filterKey: "service", unit: "ms", type: "bar", xKey: "service", yKeys: ["average", "p95"],
      data: services.map((row) => ({ service: row.service, average: row.average ?? 0, p95: row.p95 ?? 0 })) }],
    table,
    filters: [
      { key: "level", label: "Level", options: ["all", "info", "warn", "error"].map((v) => ({ label: v, value: v })) },
      { key: "service", label: "Service", options: [{ value: "", label: "All services" }, ...names.map((value) => ({ value, label: value }))] }
    ]
  };
}
