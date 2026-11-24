import { Router } from "express";
import { z } from "zod";
import { MemberRole, UserStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { hashPassword } from "../utils/security.js";
import { containsText, HttpError, pageArgs, pagination } from "../utils/http.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

const listSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    pageSize: z.string().optional(),
    search: z.string().optional(),
    role: z.nativeEnum(MemberRole).optional()
  }).optional()
});

usersRouter.get("/", validate(listSchema), async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = pageArgs(req.query.page, req.query.pageSize);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const where = {
      organizationId: req.auth!.organizationId,
      ...(req.query.role ? { role: req.query.role as MemberRole } : {}),
      ...(search ? { user: { name: containsText(search) } } : {})
    };
    const [members, total] = await Promise.all([
      prisma.organizationMember.findMany({ where, include: { user: true }, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.organizationMember.count({ where })
    ]);
    res.json({
      rows: members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        status: member.user.status,
        lastActiveAt: member.user.lastActiveAt
      })),
      pagination: pagination(page, pageSize, total)
    });
  } catch (error) {
    next(error);
  }
});

const createSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.nativeEnum(MemberRole).default(MemberRole.MEMBER)
  })
});

usersRouter.post("/", requireRole(MemberRole.ADMIN), validate(createSchema), async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (existing) throw new HttpError(409, "Email already exists");
    const user = await prisma.user.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        passwordHash: await hashPassword(req.body.password),
        status: UserStatus.INVITED,
        memberships: {
          create: {
            organizationId: req.auth!.organizationId,
            role: req.body.role
          }
        }
      }
    });
    res.status(201).json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    next(error);
  }
});

const updateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(2).optional(),
    role: z.nativeEnum(MemberRole).optional(),
    status: z.nativeEnum(UserStatus).optional()
  })
});

usersRouter.patch("/:id", requireRole(MemberRole.ADMIN), validate(updateSchema), async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    const member = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: req.auth!.organizationId, userId } }
    });
    if (!member) throw new HttpError(404, "User not found in organization");
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { name: req.body.name, status: req.body.status } }),
      prisma.organizationMember.update({ where: { id: member.id }, data: { role: req.body.role } })
    ]);
    res.json({ message: "User updated" });
  } catch (error) {
    next(error);
  }
});

usersRouter.delete("/:id", requireRole(MemberRole.ADMIN), async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    if (userId === req.auth!.userId) throw new HttpError(400, "You cannot remove yourself");
    await prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId: req.auth!.organizationId, userId } }
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
