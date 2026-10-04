import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The finalized pay period covering a local (Manila) date, if any. Once a
 * period is finalized its payslips are frozen, so attendance for those days
 * must not change either -- otherwise the attendance page would show hours
 * that no longer match what was paid.
 */
export async function findFinalizedPeriodCovering(
  dateKey: string,
  db: Prisma.TransactionClient = prisma
) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return db.payPeriod.findFirst({
    where: { status: "FINALIZED", startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true, startDate: true, endDate: true },
  });
}

export function finalizedPeriodMessage(period: { startDate: Date; endDate: Date }): string {
  const start = period.startDate.toISOString().slice(0, 10);
  const end = period.endDate.toISOString().slice(0, 10);
  return `This day is in the finalized pay period ${start} to ${end}, so its attendance is locked.`;
}
