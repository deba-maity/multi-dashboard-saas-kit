import { Router } from "express";
import { z } from "zod";
import { MemberRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { HttpError } from "../utils/http.js";
import {
  hashPassword,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken
} from "../utils/security.js";

export const authRouter = Router();

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    organizationName: z.string().min(2)
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8)
  })
});

authRouter.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, organizationName } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, "Email is already registered");

    const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        lastActiveAt: new Date(),
        memberships: {
          create: {
            role: MemberRole.ADMIN,
            organization: {
              create: { name: organizationName, slug: `${slug}-${Date.now().toString(36)}` }
            }
          }
        }
      },
      include: { memberships: { include: { organization: true } } }
    });

    const membership = user.memberships[0];
    const refreshToken = signRefreshToken(user.id, membership.organizationId);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
      }
    });

    res.status(201).json({
      accessToken: signAccessToken({
        userId: user.id,
        organizationId: membership.organizationId,
        role: membership.role
      }),
      refreshToken,
      organization: membership.organization,
      user: { id: user.id, name: user.name, email: user.email, role: membership.role }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { organization: true }, take: 1 } }
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "Invalid credentials");
    }

    if (user.status === "SUSPENDED") throw new HttpError(403, "Account is suspended");
    const membership = user.memberships[0];
    if (!membership) throw new HttpError(403, "No organization membership found");

    const refreshToken = signRefreshToken(user.id, membership.organizationId);
    await prisma.$transaction(async (tx) => {
      const active = await tx.user.updateMany({
        where: { id: user.id, status: { in: ["INVITED", "ACTIVE"] } },
        data: { lastActiveAt: new Date(), status: "ACTIVE" }
      });
      if (!active.count) throw new HttpError(403, "Account access is unavailable");
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
        }
      });
    });

    res.json({
      accessToken: signAccessToken({
        userId: user.id,
        organizationId: membership.organizationId,
        role: membership.role
      }),
      refreshToken,
      organization: membership.organization,
      user: { id: user.id, name: user.name, email: user.email, role: membership.role }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken as string | undefined;
    if (!refreshToken) throw new HttpError(401, "Missing refresh token");
    let payload;
    try { payload = verifyRefreshToken(refreshToken); }
    catch { throw new HttpError(401, "Invalid or expired refresh token"); }
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { include: { memberships: true } } }
    });
    if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
      throw new HttpError(401, "Invalid refresh token");
    }
    if (tokenRecord.userId !== payload.userId) throw new HttpError(401, "Invalid refresh token");

    const memberships = tokenRecord.user.memberships;
    const membership = payload.organizationId
      ? memberships.find((item) => item.organizationId === payload.organizationId)
      : memberships.length === 1 ? memberships[0] : undefined;
    if (!membership || tokenRecord.user.status === "SUSPENDED") throw new HttpError(403, "Account access is unavailable");
    res.json({
      role: membership.role,
      accessToken: signAccessToken({
        userId: tokenRecord.userId,
        organizationId: membership.organizationId,
        role: membership.role
      })
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken as string | undefined;
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken) },
        data: { revokedAt: new Date() }
      });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
