import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { getDashboardData } from "../services/dashboardData.js";

const dashboardSchema = z.object({
  params: z.object({
    dashboard: z.enum([
      "analytics",
      "ecommerce",
      "users",
      "finance",
      "inventory",
      "projects",
      "marketing",
      "monitoring",
      "crm",
      "insights"
    ])
  }),
  query: z.record(z.unknown()).optional()
});

type DashboardId = z.infer<typeof dashboardSchema>["params"]["dashboard"];

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/:dashboard", validate(dashboardSchema), async (req, res, next) => {
  try {
    const data = await getDashboardData(req.params.dashboard as DashboardId, req.auth!.organizationId, req.query);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
