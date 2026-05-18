import { Router } from "express";
import { authRouter } from "./auth.js";
import { dashboardRouter } from "./dashboard-data.js";
import { logsRouter } from "./logs.js";
import { organizationsRouter } from "./organizations.js";
import { transactionsRouter } from "./transactions.js";
import { usersRouter } from "./users.js";

export const router = Router();

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/organizations", organizationsRouter);
router.use("/dashboard-data", dashboardRouter);
router.use("/logs", logsRouter);
router.use("/transactions", transactionsRouter);
