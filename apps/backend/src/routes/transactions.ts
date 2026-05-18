import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { centsToCurrency, pageArgs, pagination } from "../utils/http.js";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

transactionsRouter.get("/", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = pageArgs(req.query.page, req.query.pageSize);
    const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : undefined;
    const where = { organizationId: req.auth!.organizationId, ...(status ? { status } : {}) };
    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({ where, orderBy: { occurredAt: "desc" }, skip, take }),
      prisma.transaction.count({ where })
    ]);
    res.json({
      rows: rows.map((row) => ({ ...row, amount: centsToCurrency(row.amountCents) })),
      pagination: pagination(page, pageSize, total)
    });
  } catch (error) {
    next(error);
  }
});
