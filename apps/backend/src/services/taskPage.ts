import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { pagination } from "../utils/http.js";

export async function getTaskPage(organizationId: string, search: string | undefined, status: string | undefined,
  page: number, pageSize: number, orderBy: Prisma.TaskOrderByWithRelationInput[] = [{ dueDate: "asc" }, { id: "asc" }]) {
  const match = { contains: search, mode: "insensitive" as const };
  const where = { organizationId, status, ...(search ? { OR: [{ title: match }, { project: match }, { assignee: { name: match } }] } : {}) };
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: {
      id: true, title: true, project: true, priority: true, status: true, dueDate: true, assignee: { select: { name: true } }
    } }), prisma.task.count({ where })
  ]);
  return { rows: tasks.map((task) => ({ ...task, assignee: task.assignee?.name ?? "Unassigned" })), pagination: pagination(page, pageSize, total) };
}
