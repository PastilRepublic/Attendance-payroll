"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const settingsSchema = z.object({
  otMultiplier: z.coerce.number().positive(),
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
    otMultiplier: formData.get("otMultiplier"),
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
