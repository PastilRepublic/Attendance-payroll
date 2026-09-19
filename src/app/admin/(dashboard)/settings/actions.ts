"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/lib/auth";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { hashPassword, hashPin, verifyPassword } from "@/lib/pin";
import { ADMIN_PIN_MESSAGE, ADMIN_PIN_PATTERN, assertAdminPinIsUnique } from "@/lib/adminPin";

const operationalSettingsSchema = z.object({
  requirePhotoOnPunch: z.coerce.boolean(),
  shiftStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEndTime: z.string().regex(/^\d{2}:\d{2}$/),
});

/** These directly affect pay calculations, so only OWNER may change them --
 * a SUPERVISOR's submission for these fields is ignored, never trusted from
 * the client, even if the form somehow posted values for them. */
const ownerOnlySettingsSchema = z.object({
  gracePeriodMinutes: z.coerce.number().int().min(0),
  unpaidLunchMinutes: z.coerce.number().int().min(0),
  regularHoursCapPerDay: z.coerce.number().positive(),
  payPeriodStartDay: z.coerce.number().int().min(1).max(7),
  cookingDayRate: z.coerce.number().min(0),
  jarFillingDayRate: z.coerce.number().min(0),
});

export async function updateSettings(formData: FormData) {
  const admin = await requireAdmin();
  const isOwner = admin.role === "OWNER";

  const operational = operationalSettingsSchema.parse({
    requirePhotoOnPunch: formData.get("requirePhotoOnPunch") === "on",
    shiftStartTime: formData.get("shiftStartTime"),
    shiftEndTime: formData.get("shiftEndTime"),
  });

  const before = await prisma.settings.findUnique({ where: { id: 1 } });

  const ownerOnly = isOwner
    ? ownerOnlySettingsSchema.parse({
        gracePeriodMinutes: formData.get("gracePeriodMinutes"),
        unpaidLunchMinutes: formData.get("unpaidLunchMinutes"),
        regularHoursCapPerDay: formData.get("regularHoursCapPerDay"),
        payPeriodStartDay: formData.get("payPeriodStartDay"),
        cookingDayRate: formData.get("cookingDayRate"),
        jarFillingDayRate: formData.get("jarFillingDayRate"),
      })
    : {
        gracePeriodMinutes: before?.gracePeriodMinutes ?? 10,
        unpaidLunchMinutes: before?.unpaidLunchMinutes ?? 60,
        regularHoursCapPerDay: before?.regularHoursCapPerDay ?? 8,
        payPeriodStartDay: before?.payPeriodStartDay ?? 1,
        cookingDayRate: before?.cookingDayRate ?? 400,
        jarFillingDayRate: before?.jarFillingDayRate ?? 350,
      };

  const parsed = { ...operational, ...ownerOnly };

  await prisma.settings.upsert({
    where: { id: 1 },
    update: parsed,
    create: { id: 1, ...parsed },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_SETTINGS",
    targetTable: "Settings",
    targetId: "1",
    before,
    after: parsed,
  });

  revalidatePath("/admin/settings");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmPassword"],
  });

export async function changePassword(formData: FormData) {
  const user = await requireAdmin();

  const parsed = changePasswordSchema.parse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });

  const currentValid = await verifyPassword(parsed.currentPassword, admin.passwordHash);
  if (!currentValid) {
    throw new Error("Current password is incorrect");
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(parsed.newPassword) },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "CHANGE_PASSWORD",
    targetTable: "AdminUser",
    targetId: admin.id,
  });

  await signOut({ redirectTo: "/admin/login" });
}

/** Sets (or, with a blank PIN, removes) the signed-in admin's PIN-only login. */
export async function setAdminPin(formData: FormData) {
  const user = await requireAdmin();

  const currentPassword = z.string().min(1, "Current password is required").parse(formData.get("currentPassword"));
  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
    throw new Error("Current password is incorrect");
  }

  const pin = String(formData.get("pin") ?? "").trim();
  let pinHash: string | null = null;
  if (pin) {
    if (!ADMIN_PIN_PATTERN.test(pin)) throw new Error(ADMIN_PIN_MESSAGE);
    await assertAdminPinIsUnique(pin, admin.id);
    pinHash = await hashPin(pin);
  }

  await prisma.adminUser.update({ where: { id: admin.id }, data: { pinHash } });

  await logAudit({
    actorAdminId: admin.id,
    action: pinHash ? "SET_ADMIN_PIN" : "REMOVE_ADMIN_PIN",
    targetTable: "AdminUser",
    targetId: admin.id,
  });

  revalidatePath("/admin/settings");
}
