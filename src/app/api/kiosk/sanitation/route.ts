import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { TIMEZONE } from "@/lib/payroll";

function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

export async function GET() {
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
