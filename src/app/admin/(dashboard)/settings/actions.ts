"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, signOut } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/pin";

const settingsSchema = z.object({
  gracePeriodMinutes: z.coerce.number().int().min(0),
  unpaidLunchMinutes: z.coerce.number().int().min(0),
  regularHoursCapPerDay: z.coerce.number().positive(),
  requirePhotoOnPunch: z.coerce.boolean(),
  shiftStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  payPeriodStartDay: z.coerce.number().int().min(1).max(7),
});

export async function updateSettings(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const parsed = settingsSchema.parse({
    gracePeriodMinutes: formData.get("gracePeriodMinutes"),
    unpaidLunchMinutes: formData.get("unpaidLunchMinutes"),
    regularHoursCapPerDay: formData.get("regularHoursCapPerDay"),
    requirePhotoOnPunch: formData.get("requirePhotoOnPunch") === "on",
    shiftStartTime: formData.get("shiftStartTime"),
    shiftEndTime: formData.get("shiftEndTime"),
    payPeriodStartDay: formData.get("payPeriodStartDay"),
  });

  const before = await prisma.settings.findUnique({ where: { id: 1 } });

  await prisma.settings.upsert({
    where: { id: 1 },
    update: parsed,
    create: { id: 1, ...parsed },
  });

  await logAudit({
    actorAdminId: session.user.id,
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const parsed = changePasswordSchema.parse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: session.user.id } });

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
