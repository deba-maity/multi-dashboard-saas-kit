import { Router } from "express";
import { z } from "zod";
import { taskStatuses } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { getTaskPage } from "../services/taskPage.js";
import { HttpError, pageArgs } from "../utils/http.js";

export const tasksRouter = Router();
const changeStatus = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ status: z.enum(taskStatuses), previousStatus: z.enum(taskStatuses) })
});

tasksRouter.get("/", requireAuth, validate(z.object({ query: z.object({
  status: z.enum(taskStatuses), search: z.string().optional(), page: z.string().optional(), pageSize: z.string().optional()
}) })), async (req, res, next) => {
  try {
    const { page, pageSize } = pageArgs(req.query.page, req.query.pageSize);
    res.json(await getTaskPage(req.auth!.organizationId, String(req.query.search ?? "").trim(), String(req.query.status), page, pageSize));
  } catch (error) { next(error); }
});

tasksRouter.patch("/:id/status", requireAuth, requireRole("ADMIN"), validate(changeStatus), async (req, res, next) => {
  try {
    const where = { id: String(req.params.id), organizationId: req.auth!.organizationId };
    const { count } = await prisma.task.updateMany({
      where: { ...where, status: req.body.previousStatus },
      data: { status: req.body.status }
    });
    if (!count) {
      const current = await prisma.task.findFirst({ where, select: { status: true } });
      if (!current) throw new HttpError(404, "Task not found");
      if (current.status !== req.body.status) throw new HttpError(409, "This task changed.", { currentStatus: current.status });
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});
