"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

const createItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(["INGREDIENT", "PRODUCT", "PACKAGING"]),
  unit: z.string().trim().min(1, "Unit is required"),
  lowStockThreshold: z.coerce.number().min(0),
  initialQuantity: z.coerce.number().min(0),
});

export async function createItem(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = createItemSchema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    lowStockThreshold: formData.get("lowStockThreshold"),
    initialQuantity: formData.get("initialQuantity"),
  });

  const item = await prisma.inventoryItem.create({
    data: {
      name: parsed.name,
      category: parsed.category,
      unit: parsed.unit,
      lowStockThreshold: parsed.lowStockThreshold,
      quantity: parsed.initialQuantity,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "CREATE_INVENTORY_ITEM",
    targetTable: "InventoryItem",
    targetId: item.id,
    after: { name: item.name, category: item.category, unit: item.unit, quantity: parsed.initialQuantity },
  });

  revalidatePath("/admin/inventory");
}

const stockMovementSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  reason: z.string().trim().min(3, "A reason is required (min 3 characters)"),
});

export async function recordStockMovement(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = stockMovementSchema.parse({
    itemId: formData.get("itemId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
  });

  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: parsed.itemId } });
  const delta = parsed.type === "IN" ? parsed.quantity : -parsed.quantity;
  const newQuantity = Number(item.quantity) + delta;

  if (newQuantity < 0) {
    throw new Error(
      `Cannot remove ${parsed.quantity} ${item.unit} — only ${Number(item.quantity)} ${item.unit} in stock.`
    );
  }

  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        itemId: parsed.itemId,
        type: parsed.type,
        quantity: parsed.quantity,
        reason: parsed.reason,
        createdByAdminId: admin.id,
      },
    }),
    prisma.inventoryItem.update({
      where: { id: parsed.itemId },
      data: { quantity: newQuantity },
    }),
  ]);

  await logAudit({
    actorAdminId: admin.id,
    action: parsed.type === "IN" ? "STOCK_IN" : "STOCK_OUT",
    targetTable: "InventoryItem",
    targetId: item.id,
    before: { quantity: Number(item.quantity) },
    after: { quantity: newQuantity },
    reason: parsed.reason,
  });

  revalidatePath("/admin/inventory");
}
