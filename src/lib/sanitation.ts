import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { TIMEZONE } from "@/lib/payroll";
import { getOperationDay, type ResolvedOperationDay } from "@/lib/settings";
import type { Prisma } from "@/generated/prisma/client";

export function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

/** Matches a procedure's appliesTo against whichever operation day is
 * currently active -- BOTH always matches, a specific day only matches
 * itself, and a day off only matches BOTH (nothing day-specific runs). */
export function scopeFilterFor(
  operationDay: ResolvedOperationDay
): Prisma.SanitationProcedureWhereInput["appliesTo"] {
  return operationDay === "OFF" ? "BOTH" : { in: ["BOTH", operationDay] };
}

/**
 * Assignments are scheduled per calendar day and don't appear on their own
 * -- an admin would otherwise have to re-assign procedures every day. Runs
 * on every load of a sanitation surface (cheap: only inserts what's
 * missing) rather than once per day, so toggling the operation day
 * mid-day immediately schedules whichever procedures newly apply, as
 * fresh unassigned/pending duties. Already-scheduled procedures for a
 * *different* operation day are left alone (not deleted) -- see
 * scopeFilterFor, applied at read time, for hiding them from today's
 * display.
 */
export async function ensureTodaysSanitationSchedule(): Promise<void> {
  const today = new Date(`${todayManila()}T00:00:00.000Z`);
  const operationDay = await getOperationDay();

  const matchingProcedures = await prisma.sanitationProcedure.findMany({
    where: { active: true, appliesTo: scopeFilterFor(operationDay) },
    select: { id: true },
  });
  if (matchingProcedures.length === 0) return;

  const existing = await prisma.sanitationAssignment.findMany({
    where: { date: today, procedureId: { in: matchingProcedures.map((p) => p.id) } },
    select: { procedureId: true },
  });
  const existingIds = new Set(existing.map((a) => a.procedureId));
  const toCreate = matchingProcedures.filter((p) => !existingIds.has(p.id));
  if (toCreate.length === 0) return;

  await prisma.sanitationAssignment.createMany({
    data: toCreate.map((p) => ({ procedureId: p.id, date: today })),
  });
}
