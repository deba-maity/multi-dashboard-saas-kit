import type { Prisma } from "@prisma/client";
import { invoiceAgeFilter, type DashboardResponse } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { centsToCurrency, containsText, pageArgs, pagination, reportOrder } from "../utils/http.js";
import { invoiceLedger, receivableSummary, utcDay } from "./receivables.js";

type Query = Record<string, unknown>;

async function transactionLedger(organizationId: string, query: Query): Promise<DashboardResponse["table"]> {
  const { page, pageSize, skip, take } = pageArgs(query.page, query.pageSize);
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const match = containsText(search);
  const where: Prisma.TransactionWhereInput = { organizationId,
    ...(typeof query.status === "string" && query.status && query.status !== "all" && { status: query.status }),
    ...(search && { OR: [{ description: match }, { type: match }, { status: match }] })
  };
  const direction = query.direction === "desc" ? "desc" : "asc";
  const sorts: Record<string, Prisma.TransactionOrderByWithRelationInput> = {
    description: { description: direction }, type: { type: direction }, status: { status: direction },
    amount: { amountCents: direction }, occurredAt: { occurredAt: direction }
  };
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: reportOrder<Prisma.TransactionOrderByWithRelationInput>(query.sort, sorts, { occurredAt: "desc" }, { id: "asc" }), skip, take }),
    prisma.transaction.count({ where })
  ]);
  return {
    title: "Transaction ledger",
    columns: [
      { key: "description", label: "Description" }, { key: "type", label: "Type" },
      { key: "status", label: "Status", type: "status" }, { key: "amount", label: "Amount", type: "currency" },
      { key: "occurredAt", label: "Date", type: "date" }
    ],
    rows: rows.map((row) => ({ ...row, amount: centsToCurrency(row.amountCents) })), pagination: pagination(page, pageSize, total)
  };
}

export function getFinanceLedger(organizationId: string, query: Query, today: Date) {
  return query.ledger === "invoices" ? invoiceLedger(organizationId, query, today) : transactionLedger(organizationId, query);
}

export async function getFinanceReport(organizationId: string, query: Query, now = new Date()): Promise<DashboardResponse> {
  const invoices = query.ledger === "invoices";
  const today = utcDay(now);
  const [table, receivables, cash] = await Promise.all([
    getFinanceLedger(organizationId, query, today),
    receivableSummary(organizationId, today),
    prisma.$queryRaw<Array<{ month: Date; settled: bigint; pending: bigint; paidCount: bigint; failed: bigint }>>`
      SELECT date_trunc('month', "occurredAt") AS month,
        coalesce(sum("amountCents") FILTER (WHERE status = 'paid'), 0) AS settled,
        coalesce(sum("amountCents") FILTER (WHERE status = 'pending'), 0) AS pending,
        count(*) FILTER (WHERE status = 'paid') AS "paidCount",
        count(*) FILTER (WHERE status = 'failed') AS failed
      FROM "Transaction" WHERE "organizationId" = ${organizationId} GROUP BY 1 ORDER BY 1`
  ]);
  const total = (key: "settled" | "pending" | "failed") => Number(cash.reduce((n, month) => n + month[key], 0n));
  const dateLabel = today.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
  return {
    id: "finance", title: "Finance & Billing",
    description: "Track settled payments and see which customers have balances coming due.",
    periodLabel: "Invoice balances as of " + dateLabel + " UTC",
    metrics: [
      { label: "Settled cashflow", value: centsToCurrency(total("settled")), format: "currency", tone: "emerald" },
      { label: "Paid invoices", value: receivables.paid, tone: "sky" },
      { label: "Past-due invoices", value: receivables.overdue, tone: "rose", drill: {label: "Review past-due invoices", params: {ledger: "invoices", aging: "past-due"}} },
      { label: "Pending amount", value: centsToCurrency(total("pending")), format: "currency", tone: "amber" }
    ],
    charts: [
      { name: "Settled cashflow", unit: "USD", type: "line", xKey: "month", yKeys: ["revenue"], data: cash.filter((row) => row.paidCount > 0n)
        .map((row) => ({ month: row.month.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), revenue: centsToCurrency(Number(row.settled)), volume: Number(row.paidCount) })) },
      { name: "Outstanding balance by age", filterKey: "aging", unit: "USD", type: "bar", xKey: "age", yKeys: ["balance"], data: receivables.bands }
    ],
    table,
    filters: invoices ? [invoiceAgeFilter] : [{ key: "status", label: "Payment status",
      options: ["all", "paid", "open", "pending", "failed"].map((v) => ({ label: v, value: v })) }],
    widgets: [
      { title: "Unpaid invoices", value: String(receivables.outstanding), detail: "Open balances, including invoices due today or later." },
      { title: "Failed payments", value: String(total("failed")), detail: "Failed transactions in the ledger." }
    ]
  };
}
