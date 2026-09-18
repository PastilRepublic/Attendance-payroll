import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { TIMEZONE } from "@/lib/payroll";
import { getOperationDay } from "@/lib/settings";

export function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

/**
 * Assignments are scheduled per calendar day and don't appear on their own
 * -- an admin would otherwise have to re-assign procedures every day.
 * Whoever loads a sanitation surface first each day calls this, which
 * auto-schedules every active procedure tagged for today's operation day
 * (Cooking, Jar Filling, or BOTH -- procedures tagged BOTH are the only
 * ones scheduled on a day off), as fresh unassigned/pending duties.
 */
export async function ensureTodaysSanitationSchedule(): Promise<void> {
  const today = new Date(`${todayManila()}T00:00:00.000Z`);

  const todayCount = await prisma.sanitationAssignment.count({ where: { date: today } });
  if (todayCount > 0) return;

  const operationDay = await getOperationDay();
  const matchingProcedures = await prisma.sanitationProcedure.findMany({
    where: {
      active: true,
      appliesTo: operationDay === "OFF" ? "BOTH" : { in: ["BOTH", operationDay] },
    },
    select: { id: true },
  });
  if (matchingProcedures.length === 0) return;

  await prisma.sanitationAssignment.createMany({
    data: matchingProcedures.map((p) => ({ procedureId: p.id, date: today })),
  });
}
