import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { PayrollSettings } from "@/lib/payroll";
import { TIMEZONE, localDateKey } from "@/lib/payroll";

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

export type OperationDay = "COOKING" | "JAR_FILLING";
export type ResolvedOperationDay = OperationDay | "OFF";

// Default weekly rotation when nobody has manually overridden today's
// operation day: alternates starting Monday, Sunday is a day off.
const WEEKDAY_ROTATION: Record<string, ResolvedOperationDay> = {
  Sunday: "OFF",
  Monday: "COOKING",
  Tuesday: "JAR_FILLING",
  Wednesday: "COOKING",
  Thursday: "JAR_FILLING",
  Friday: "COOKING",
  Saturday: "JAR_FILLING",
};

function defaultOperationDayForToday(): ResolvedOperationDay {
  const weekday = formatInTimeZone(new Date(), TIMEZONE, "EEEE");
  return WEEKDAY_ROTATION[weekday] ?? "COOKING";
}

/**
 * Today's operation day. A manual toggle (setOperationDay) only holds for
 * the calendar day it was set on -- once operationDayOverrideDate is no
 * longer today, this falls back to the fixed weekday rotation above.
 */
export async function getOperationDay(): Promise<ResolvedOperationDay> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const overriddenToday =
    row.operationDayOverrideDate && localDateKey(row.operationDayOverrideDate) === localDateKey(new Date());
  return overriddenToday ? row.operationDay : defaultOperationDayForToday();
}

export async function setOperationDay(value: OperationDay): Promise<OperationDay> {
  const today = new Date(`${localDateKey(new Date())}T00:00:00.000Z`);
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: { operationDay: value, operationDayOverrideDate: today },
    create: { id: 1, operationDay: value, operationDayOverrideDate: today },
  });
  return row.operationDay;
}
