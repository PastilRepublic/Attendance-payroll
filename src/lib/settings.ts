import { prisma } from "@/lib/prisma";
import type { PayrollSettings, OperationPayRates } from "@/lib/payroll";
import { localDateKey } from "@/lib/payroll";
import {
  rotationDayForDate,
  type OperationDay,
  type ResolvedOperationDay,
} from "@/lib/operationDay";

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

/** Per-day rates for OPERATION_DAY (production) employees. */
export async function getOperationPayRates(): Promise<OperationPayRates> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return {
    cooking: Number(row.cookingDayRate),
    jarFilling: Number(row.jarFillingDayRate),
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

export type { OperationDay, ResolvedOperationDay };

function defaultOperationDayForToday(): ResolvedOperationDay {
  return rotationDayForDate(localDateKey(new Date()));
}

/**
 * Today's operation day. A manual toggle (setOperationDay) only holds for
 * the calendar day it was set on -- once operationDayOverrideDate is no
 * longer today, this falls back to the fixed weekday rotation. Every toggle is
 * also kept per date in OperationDayLog, which is what payroll reads.
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
  const [row] = await Promise.all([
    prisma.settings.upsert({
      where: { id: 1 },
      update: { operationDay: value, operationDayOverrideDate: today },
      create: { id: 1, operationDay: value, operationDayOverrideDate: today },
    }),
    setOperationDayForDate(today, value),
  ]);
  return row.operationDay;
}

/** Records the operation day for one date (a UTC-midnight Date), for payroll. */
export async function setOperationDayForDate(date: Date, value: OperationDay) {
  await prisma.operationDayLog.upsert({
    where: { date },
    update: { operationDay: value },
    create: { date, operationDay: value },
  });
}

/** Recorded operation-day overrides in [startDate, endDate], keyed by YYYY-MM-DD. */
export async function getOperationDayOverrides(
  startDate: Date,
  endDate: Date
): Promise<Map<string, OperationDay>> {
  const rows = await prisma.operationDayLog.findMany({
    where: { date: { gte: startDate, lte: endDate } },
  });
  return new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.operationDay]));
}
