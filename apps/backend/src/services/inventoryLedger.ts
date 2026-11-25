import type { Prisma } from "@prisma/client";
import type { DashboardResponse } from "@saas-kit/shared";
import { prisma } from "../config/prisma.js";
import { containsText, pageArgs, pagination, reportOrder } from "../utils/http.js";

export async function getInventoryLedger(organizationId: string, query: Record<string, unknown>): Promise<DashboardResponse["table"]> {
  const {page, pageSize, skip, take} = pageArgs(query.page, query.pageSize);
  const q = typeof query.search === "string" ? query.search.trim() : "";
  const match = containsText(q);
  const status = query.status;
  const direction = query.direction === "desc" ? "desc" : "asc";
  const reorderPoint = prisma.inventoryItem.fields.reorderPoint;
  const stock = status === "low" ? { lte: reorderPoint } : status === "healthy" ? { gt: reorderPoint } : undefined;
  const where = {
    organizationId, stock,
    ...(q ? { OR: [{ product: { name: match } }, { product: { sku: match } }, { warehouse: match }] } : {})
  };
  const [rows, total] = await Promise.all([
    prisma.inventoryItem.findMany({ where, include: { product: true }, orderBy: reportOrder<Prisma.InventoryItemOrderByWithRelationInput>(query.sort, {
      product: { product: { name: direction } },
      sku: { product: { sku: direction } },
      warehouse: { warehouse: direction },
      stock: { stock: direction },
      reorderPoint: { reorderPoint: direction }
    }, { stock: "asc" }, { id: "asc" }), skip, take }),
    prisma.inventoryItem.count({ where })
  ]);
  return {
    title: "Stock ledger",
    columns: [
      { key: "product", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "warehouse", label: "Warehouse" },
      { key: "stock", label: "Stock", type: "number" },
      { key: "reorderPoint", label: "Reorder at", type: "number" },
      { key: "status", label: "Stock health", type: "status", sortable: false }
    ],
    rows: rows.map((i) => ({ id: i.id, product: i.product.name, sku: i.product.sku, warehouse: i.warehouse, stock: i.stock, reorderPoint: i.reorderPoint, status: i.stock <= i.reorderPoint ? "low" : "healthy" })),
    pagination: pagination(page, pageSize, total)
  };
}
