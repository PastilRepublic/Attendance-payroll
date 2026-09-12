import { prisma } from "@/lib/prisma";
import type { PayrollSettings } from "@/lib/payroll";

export async function getSettings(): Promise<PayrollSettings> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return {
    otMultiplier: Number(row.otMultiplier),
    unpaidLunchMinutes: row.unpaidLunchMinutes,
    regularHoursCapPerDay: Number(row.regularHoursCapPerDay),
    gracePeriodMinutes: row.gracePeriodMinutes,
    shiftStartTime: row.shiftStartTime,
    shiftEndTime: row.shiftEndTime,
  };
}

export async function getRequirePhotoOnPunch(): Promise<boolean> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return row.requirePhotoOnPunch;
}
