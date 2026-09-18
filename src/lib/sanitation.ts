import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { TIMEZONE } from "@/lib/payroll";

export function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

/**
 * Assignments are scheduled per calendar day and don't carry forward on
 * their own -- an admin has to re-assign procedures every day. Whoever
 * loads a sanitation surface first each day calls this, which copies the
 * most recently scheduled day's procedures onto today (unassigned,
 * pending) so the board isn't empty just because nobody has visited
 * /admin/sanitation yet.
 */
export async function ensureTodaysSanitationSchedule(): Promise<void> {
  const today = new Date(`${todayManila()}T00:00:00.000Z`);

  const todayCount = await prisma.sanitationAssignment.count({ where: { date: today } });
  if (todayCount > 0) return;

  const lastScheduledDay = await prisma.sanitationAssignment.findFirst({
    where: { date: { lt: today } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!lastScheduledDay) return;

  const previousAssignments = await prisma.sanitationAssignment.findMany({
    where: { date: lastScheduledDay.date },
    select: { procedureId: true },
  });
  const procedureIds = [...new Set(previousAssignments.map((a) => a.procedureId))];
  if (procedureIds.length === 0) return;

  // Re-check active status -- a procedure retired since the last scheduled
  // day shouldn't get resurrected.
  const activeProcedures = await prisma.sanitationProcedure.findMany({
    where: { id: { in: procedureIds }, active: true },
    select: { id: true },
  });
  if (activeProcedures.length === 0) return;

  await prisma.sanitationAssignment.createMany({
    data: activeProcedures.map((p) => ({ procedureId: p.id, date: today })),
  });
}
