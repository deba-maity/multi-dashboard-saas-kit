import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { pageArgs, pagination } from "../utils/http.js";

export const logsRouter = Router();
logsRouter.use(requireAuth);

logsRouter.get("/", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = pageArgs(req.query.page, req.query.pageSize);
    const level = typeof req.query.level === "string" && req.query.level !== "all" ? req.query.level : undefined;
    const where = { organizationId: req.auth!.organizationId, ...(level ? { level } : {}) };
    const [rows, total] = await Promise.all([
      prisma.systemLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.systemLog.count({ where })
    ]);
    res.json({ rows, pagination: pagination(page, pageSize, total) });
  } catch (error) {
    next(error);
  }
});
