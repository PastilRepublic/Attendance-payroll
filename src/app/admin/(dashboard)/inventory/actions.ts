"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { runForm, type FormState } from "@/lib/formAction";
import { numberText } from "@/lib/numberInput";

const MAX_QUANTITY = 1_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const quantityField = (label: string) =>
  z.coerce
    .number()
    .min(0, `${label} can't be negative`)
    .max(MAX_QUANTITY, `${label} must be 1,000,000 or less`)
    .transform(round2);

/** Two active items can't share a name (capital letters don't count). */
async function assertNameAvailable(name: string, excludeId?: string) {
  const duplicate = await prisma.inventoryItem.findFirst({
    where: {
      active: true,
      name: { equals: name, mode: "insensitive" },
      id: excludeId ? { not: excludeId } : undefined,
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error("An item with this name already exists.");
  }
}

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
    lowStockThreshold: numberText(formData.get("lowStockThreshold")),
    initialQuantity: numberText(formData.get("initialQuantity")),
  });

  await assertNameAvailable(parsed.name);

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
    quantity: numberText(formData.get("quantity")),
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

const updateItemSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(["INGREDIENT", "PRODUCT", "PACKAGING"]),
  unit: z.string().trim().min(1, "Unit is required"),
  lowStockThreshold: quantityField("Low-stock threshold"),
});

/** Edits an item's details. The quantity on hand only changes through stock in/out, so it always has a reason. */
export async function updateItem(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = updateItemSchema.parse({
    itemId: formData.get("itemId"),
    name: formData.get("name"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    lowStockThreshold: numberText(formData.get("lowStockThreshold")),
  });

  const before = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: parsed.itemId } });
  if (before.active) await assertNameAvailable(parsed.name, parsed.itemId);

  const item = await prisma.inventoryItem.update({
    where: { id: parsed.itemId },
    data: {
      name: parsed.name,
      category: parsed.category,
      unit: parsed.unit,
      lowStockThreshold: parsed.lowStockThreshold,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_INVENTORY_ITEM",
    targetTable: "InventoryItem",
    targetId: item.id,
    before: {
      name: before.name,
      category: before.category,
      unit: before.unit,
      lowStockThreshold: Number(before.lowStockThreshold),
    },
    after: {
      name: item.name,
      category: item.category,
      unit: item.unit,
      lowStockThreshold: Number(item.lowStockThreshold),
    },
  });

  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${item.id}`);
}

/** Deactivating hides an item from the list but keeps it, and its history, saved. */
export async function setItemActive(formData: FormData) {
  const admin = await requireAdmin();
  const itemId = z.string().min(1).parse(formData.get("itemId"));
  const active = formData.get("active") === "true";

  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  if (active) await assertNameAvailable(item.name, itemId);

  await prisma.inventoryItem.update({ where: { id: itemId }, data: { active } });

  await logAudit({
    actorAdminId: admin.id,
    action: active ? "REACTIVATE_INVENTORY_ITEM" : "DEACTIVATE_INVENTORY_ITEM",
    targetTable: "InventoryItem",
    targetId: itemId,
    after: { name: item.name, quantity: Number(item.quantity) },
  });

  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${itemId}`);
}

// Form versions of the actions above (see ActionForm): they return the problem
// to the form instead of throwing.
export async function createItemForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => createItem(formData));
}

export async function recordStockMovementForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => recordStockMovement(formData));
}

export async function updateItemForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => updateItem(formData));
}

export async function setItemActiveForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => setItemActive(formData));
}
