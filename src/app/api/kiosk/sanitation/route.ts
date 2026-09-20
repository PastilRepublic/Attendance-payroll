import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTodaysSanitationSchedule, scopeFilterFor, todayManila } from "@/lib/sanitation";
import { getOperationDay } from "@/lib/settings";

export async function GET() {
  await ensureTodaysSanitationSchedule();
  const date = todayManila();
  const operationDay = await getOperationDay();

  const assignments = await prisma.sanitationAssignment.findMany({
    where: {
      date: new Date(`${date}T00:00:00.000Z`),
      procedure: { appliesTo: scopeFilterFor(operationDay) },
    },
    include: { procedure: true, employee: true },
    orderBy: { procedure: { name: "asc" } },
  });

  const tasks = assignments.map((a) => ({
    id: a.id,
    name: a.procedure.name,
    riskLevel: a.procedure.riskLevel,
    timing: a.procedure.timing,
    status: a.status,
    employeeName: a.employee?.name ?? null,
    inspectionResult: a.inspectionResult,
  }));

  return NextResponse.json({
    tasks,
    doneCount: tasks.filter((t) => t.status === "DONE").length,
    totalCount: tasks.length,
  });
}
