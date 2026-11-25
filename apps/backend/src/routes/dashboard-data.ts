import { Router } from "express";
import { ledgerDashboards } from "@saas-kit/shared";
import { getFinanceLedger } from "../services/financeReport.js";
import { getInventoryLedger } from "../services/inventoryLedger.js";
import { getCampaignLedger } from "../services/marketing.js";
import { getMonitoringLedger } from "../services/monitoring.js";
import { utcDay } from "../services/receivables.js";
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

const ledgerSchema = dashboardSchema.extend({ params: z.object({dashboard: z.enum(ledgerDashboards)}) });
type LedgerId = (typeof ledgerDashboards)[number];

dashboardRouter.get("/:dashboard/records", validate(ledgerSchema), async (req, res, next) => {
  try {
    const dashboard = req.params.dashboard as LedgerId;
    const org = req.auth!.organizationId;
    if (dashboard === "finance") {
      const today = utcDay(new Date());
      res.json({ table: await getFinanceLedger(org, req.query, today), periodLabel: today.toISOString().slice(0, 10) });
    } else {
      const ledgers = { inventory: getInventoryLedger, marketing: getCampaignLedger, monitoring: getMonitoringLedger };
      res.json({ table: await ledgers[dashboard](org, req.query) });
    }
  } catch (error) { next(error); }
});
