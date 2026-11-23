import type { NextFunction, Request, Response } from "express";
import type { MemberRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/http.js";
import { verifyAccessToken } from "../utils/security.js";

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new HttpError(401, "Missing access token");

    const payload = verifyAccessToken(token);
    const membership = await prisma.organizationMember.findUnique({
      select: { role: true, user: { select: { status: true } } },
      where: {
        organizationId_userId: {
          organizationId: payload.organizationId,
          userId: payload.userId
        }
      }
    });

    if (!membership || membership.user.status === "SUSPENDED") throw new HttpError(401, "Tenant membership not found");
    req.auth = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: membership.role
    };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired access token"));
  }
};

export const requireRole = (...roles: MemberRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new HttpError(401, "Authentication required"));
    if (!roles.includes(req.auth.role)) return next(new HttpError(403, "Insufficient permissions"));
    next();
  };
};
