import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

organizationsRouter.get("/current", async (req, res, next) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.auth!.organizationId },
      include: { _count: { select: { members: true, orders: true, tasks: true } } }
    });
    res.json(organization);
  } catch (error) {
    next(error);
  }
});
