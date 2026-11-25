import { Prisma } from "@prisma/client";
import { invoiceAgeBands } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { centsToCurrency, containsText, pageArgs, pagination, reportOrder } from "../utils/http.js";

const dayMs = 86_400_000;
const unpaid = ["open", "overdue"];

export function utcDay(date: Date) {
  return new Date(Math.floor(date.getTime() / dayMs) * dayMs);
}

export function invoiceDaysPastDue(due: Date, today: Date) {
  return Math.max(0, (utcDay(today).getTime() - utcDay(due).getTime()) / dayMs);
}

export function invoiceDueRange(value: unknown, today: Date): Prisma.DateTimeFilter | undefined {
  if (value === "past-due") return { lt: utcDay(today) };
  const index = invoiceAgeBands.findIndex((band) => band.value === value);
  if (index < 0) return undefined;
  const startOfDay = utcDay(today).getTime();
  const cutoff = (age: number) => new Date(startOfDay - (age - 1) * dayMs);
  const next = invoiceAgeBands[index + 1];
  return {
    ...(index > 0 && { lt: cutoff(invoiceAgeBands[index].minDays) }),
    ...(next && { gte: cutoff(next.minDays) })
  };
}

export async function receivableSummary(organizationId: string, today: Date) {
  const thresholds = invoiceAgeBands.slice(1).map((band) => band.minDays);
  const rows = await prisma.$queryRaw<Array<{ band: number; count: bigint; cents: bigint }>>`
    SELECT CASE WHEN status = 'paid' THEN -1 ELSE
      width_bucket(${today.toISOString().slice(0, 10)}::date - "dueDate"::date, ARRAY[${Prisma.join(thresholds)}]::integer[])
    END AS band, count(*) AS count, sum("amountCents") AS cents
    FROM "Invoice" WHERE "organizationId" = ${organizationId}
      AND status IN ('paid', ${Prisma.join(unpaid)})
    GROUP BY 1`;
  const bands = invoiceAgeBands.map(({ label }, index) => {
    const row = rows.find((entry) => entry.band === index);
    return { age: label, balance: centsToCurrency(Number(row?.cents ?? 0)), count: Number(row?.count ?? 0) };
  });
  const outstanding = bands.reduce((n, band) => n + band.count, 0);
  return { bands, outstanding, overdue: outstanding - bands[0].count,
    paid: Number(rows.find((row) => row.band === -1)?.count ?? 0) };
}

export async function invoiceLedger(organizationId: string, query: Record<string, unknown>, today: Date) {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize);
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const match = containsText(search);
  const age = query.aging;
  const knownAge = !age || age === "all" || age === "past-due" || invoiceAgeBands.some((band) => band.value === age);
  const where: Prisma.InvoiceWhereInput = { organizationId, status: { in: unpaid },
    ...(!knownAge && {id: {in: []}}),
    dueDate: invoiceDueRange(query.aging, today),
    ...(search && { OR: [{ invoiceNumber: match }, { customerName: match }] })
  };
  const direction = query.direction === "desc" ? "desc" : "asc";
  const sorts: Record<string, Prisma.InvoiceOrderByWithRelationInput> = {
    invoiceNumber: { invoiceNumber: direction }, customerName: { customerName: direction },
    dueDate: { dueDate: direction }, balance: { amountCents: direction }
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: reportOrder<Prisma.InvoiceOrderByWithRelationInput>(query.sort, sorts, { dueDate: "asc" }, { id: "asc" }), skip, take,
      select: { id: true, invoiceNumber: true, customerName: true, dueDate: true, amountCents: true } }),
    prisma.invoice.count({ where })
  ]);
  return {
    title: "Outstanding invoices", searchFields: ["invoiceNumber", "customerName"],
    columns: [
      { key: "invoiceNumber", label: "Invoice" }, { key: "customerName", label: "Customer" },
      { key: "dueDate", label: "Due date", type: "date" as const },
      { key: "balance", label: "Balance", type: "currency" as const },
      { key: "daysPastDue", label: "Days past due", type: "number" as const, sortable: false }
    ],
    rows: rows.map(({ amountCents, ...row }) => {
      const daysPastDue = invoiceDaysPastDue(row.dueDate, today);
      const band = invoiceAgeBands.reduce((current, item) => daysPastDue >= item.minDays ? item : current);
      return { ...row, balance: centsToCurrency(amountCents), daysPastDue, aging: band.value };
    }),
    pagination: pagination(page, pageSize, total)
  };
}
