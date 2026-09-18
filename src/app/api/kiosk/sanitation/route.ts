import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTodaysSanitationSchedule, todayManila } from "@/lib/sanitation";

export async function GET() {
  await ensureTodaysSanitationSchedule();
  const date = todayManila();

  const assignments = await prisma.sanitationAssignment.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
    include: { procedure: true, employee: true },
    orderBy: { procedure: { name: "asc" } },
  });

  const tasks = assignments.map((a) => ({
    id: a.id,
    name: a.procedure.name,
    riskLevel: a.procedure.riskLevel,
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
