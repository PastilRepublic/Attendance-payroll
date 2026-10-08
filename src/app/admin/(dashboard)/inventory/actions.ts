"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { runForm, type FormState } from "@/lib/formAction";

const MAX_QUANTITY = 1_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const quantityField = (label: string) =>
  z.coerce
    .number()
    .min(0, `${label} can't be negative`)
    .max(MAX_QUANTITY, `${label} must be 1,000,000 or less`)
    .transform(round2);

const createItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(["INGREDIENT", "PRODUCT", "PACKAGING"]),
  unit: z.string().trim().min(1, "Unit is required"),
  lowStockThreshold: quantityField("Low-stock threshold"),
  initialQuantity: quantityField("Starting quantity"),
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

  const duplicate = await prisma.inventoryItem.findFirst({
    where: { active: true, name: { equals: parsed.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error("An item with this name already exists.");
  }

  // The starting stock is recorded as a first movement too, so the item's
  // history adds up to what's on hand.
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        name: parsed.name,
        category: parsed.category,
        unit: parsed.unit,
        lowStockThreshold: parsed.lowStockThreshold,
        quantity: parsed.initialQuantity,
      },
    });
    if (parsed.initialQuantity > 0) {
      await tx.stockMovement.create({
        data: {
          itemId: created.id,
          type: "IN",
          quantity: parsed.initialQuantity,
          reason: "Starting stock",
          createdByAdminId: admin.id,
        },
      });
    }
    return created;
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
  quantity: z.coerce
    .number()
    .positive("Quantity must be greater than 0")
    .max(MAX_QUANTITY, "Quantity must be 1,000,000 or less")
    .transform(round2),
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

  // The stock check and the change happen together, in one step, so two
  // movements recorded at the same moment can't overwrite each other.
  const { item, before, after } = await prisma.$transaction(async (tx) => {
    const current = await tx.inventoryItem.findUnique({ where: { id: parsed.itemId } });
    if (!current || !current.active) throw new Error("That item no longer exists.");

    if (parsed.type === "OUT") {
      const removed = await tx.inventoryItem.updateMany({
        where: { id: parsed.itemId, quantity: { gte: parsed.quantity } },
        data: { quantity: { decrement: parsed.quantity } },
      });
      if (removed.count === 0) {
        const latest = await tx.inventoryItem.findUniqueOrThrow({ where: { id: parsed.itemId } });
        throw new Error(
          `Cannot remove ${parsed.quantity} ${current.unit} — only ${Number(latest.quantity)} ${current.unit} in stock.`
        );
      }
    } else {
      await tx.inventoryItem.update({
        where: { id: parsed.itemId },
        data: { quantity: { increment: parsed.quantity } },
      });
    }

    await tx.stockMovement.create({
      data: {
        itemId: parsed.itemId,
        type: parsed.type,
        quantity: parsed.quantity,
        reason: parsed.reason,
        createdByAdminId: admin.id,
      },
    });

    const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id: parsed.itemId } });
    const delta = parsed.type === "IN" ? parsed.quantity : -parsed.quantity;
    return { item: current, before: Number(updated.quantity) - delta, after: Number(updated.quantity) };
  });

  await logAudit({
    actorAdminId: admin.id,
    action: parsed.type === "IN" ? "STOCK_IN" : "STOCK_OUT",
    targetTable: "InventoryItem",
    targetId: item.id,
    before: { quantity: before },
    after: { quantity: after },
    reason: parsed.reason,
  });

  revalidatePath("/admin/inventory");
}

// Form versions of the actions above (see ActionForm): they return the problem
// to the form instead of throwing.
export async function createItemForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => createItem(formData));
}

export async function recordStockMovementForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => recordStockMovement(formData));
}
