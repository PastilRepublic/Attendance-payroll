import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTodayRange, derivePresenceStatus, type PresenceStatus } from "@/lib/kioskAttendance";

export async function GET() {
  const { dayStart, dayEnd } = getTodayRange();

  const [employees, todayPunches, supervisors] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true, photoPath: true },
      orderBy: { name: "asc" },
    }),
    prisma.punch.findMany({
      where: { voided: false, timestamp: { gte: dayStart, lt: dayEnd } },
      orderBy: { timestamp: "asc" },
      select: { employeeId: true, type: true },
    }),
    prisma.adminUser.findMany({
      where: { role: "SUPERVISOR", active: true, employeeId: { not: null } },
      select: { employeeId: true },
    }),
  ]);

  const lastPunchByEmployee = new Map<string, (typeof todayPunches)[number]["type"]>();
  for (const p of todayPunches) {
    lastPunchByEmployee.set(p.employeeId, p.type);
  }

  const supervisorEmployeeIds = new Set(supervisors.map((s) => s.employeeId));

  const result: {
    id: string;
    name: string;
    photoUrl: string | null;
    status: PresenceStatus;
    roleTag: string | null;
  }[] = employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    photoUrl: emp.photoPath ? `/api/kiosk/employee-photo/${emp.photoPath}` : null,
    status: derivePresenceStatus(lastPunchByEmployee.get(emp.id) ?? null),
    roleTag: supervisorEmployeeIds.has(emp.id) ? "supervisor" : null,
  }));

  return NextResponse.json({ employees: result });
}
