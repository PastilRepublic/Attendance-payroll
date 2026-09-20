import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import {
  ensureTodaysSanitationSchedule,
  getSanitationSettings,
  getUpcomingSanitation,
  scopeFilterFor,
  todayManila,
} from "@/lib/sanitation";
import { getOperationDay } from "@/lib/settings";
import { TIMING_RANK } from "@/lib/sanitationLabels";
import { formatDateKey } from "@/lib/sanitationSchedule";
import SanitationBoard from "./SanitationBoard";

export const dynamic = "force-dynamic";

export default async function SanitationBoardPage() {
  await ensureTodaysSanitationSchedule();
  const date = todayManila();
  const [operationDay, settings] = await Promise.all([getOperationDay(), getSanitationSettings()]);

  const [assignments, upcoming] = await Promise.all([
    prisma.sanitationAssignment.findMany({
      where: {
        date: new Date(`${date}T00:00:00.000Z`),
        procedure: { appliesTo: scopeFilterFor(operationDay) },
      },
      include: { procedure: true, employee: true },
      orderBy: { procedure: { name: "asc" } },
    }),
    getUpcomingSanitation(date, operationDay, settings),
  ]);

  // Before-lunch duties first; the name order from the query holds within a group.
  const tasks = assignments
    .map((a) => ({
      id: a.id,
      name: a.procedure.name,
      instruction: a.procedure.steps,
      timing: a.procedure.timing,
      schedule: a.procedure.schedule,
      status: a.status,
      employeeName: a.employee?.name ?? null,
      completedLabel: a.completedAt ? formatInTimeZone(a.completedAt, TIMEZONE, "h:mm a") : null,
      inspectionResult: a.inspectionResult,
    }))
    .sort((a, b) => TIMING_RANK[a.timing] - TIMING_RANK[b.timing]);

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 flex items-center justify-between gap-3 py-4 px-4 sm:px-6">
        <h1 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
          The Famous Pastil Republic
        </h1>
        <Link
          href="/"
          className="shrink-0 rounded-md bg-slate-900 text-white px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium hover:bg-slate-800"
        >
          Home
        </Link>
      </div>

      <div className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">Sanitation checklist</h2>
          <p className="text-sm text-slate-500 mb-6">{formatDateKey(date, "EEEE, MMMM d")}</p>

          <SanitationBoard
            tasks={tasks}
            weekly={upcoming.weekly}
            monthly={upcoming.monthly}
          />
        </div>
      </div>
    </div>
  );
}
