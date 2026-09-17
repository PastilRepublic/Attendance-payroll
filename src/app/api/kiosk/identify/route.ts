import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getRequirePhotoOnPunch } from "@/lib/settings";
import { TIMEZONE } from "@/lib/payroll";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getKioskSnapshot } from "@/lib/kioskAttendance";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;
  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const matched = await resolveEmployeeByPin(pin, employeeId);
  if (!matched) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  const snapshot = await getKioskSnapshot(matched.id);
  // Kept for backward compatibility with any already-queued offline items
  // built against the old two-state toggle.
  const nextType: "IN" | "OUT" = snapshot.status === "OUT" ? "IN" : "OUT";

  // A supervisor's job is to assign/inspect these, not do them alongside the
  // team -- skip the checklist entirely for them (Time In/Out still works
  // as normal). A revoked supervisor goes back to seeing it like anyone else.
  const supervisorAccount = await prisma.adminUser.findUnique({
    where: { employeeId: matched.id },
    select: { role: true, active: true },
  });
  const isActiveSupervisor = supervisorAccount?.role === "SUPERVISOR" && supervisorAccount.active;

  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const [pendingTasks, pendingSanitation] = isActiveSupervisor
    ? [[], []]
    : await Promise.all([
        prisma.taskAssignment.findMany({
          where: {
            employeeId: matched.id,
            date: new Date(`${today}T00:00:00.000Z`),
            status: "PENDING",
          },
          include: { template: true },
        }),
        prisma.sanitationAssignment.findMany({
          where: {
            date: new Date(`${today}T00:00:00.000Z`),
            status: "PENDING",
            OR: [{ employeeId: null }, { employeeId: matched.id }],
          },
          include: { procedure: true },
        }),
      ]);

  return NextResponse.json({
    employeeId: matched.id,
    employeeName: matched.name,
    nextType,
    status: snapshot.status,
    allowedActions: snapshot.allowedActions,
    activityLog: snapshot.activityLog,
    totals: snapshot.totals,
    requirePhoto: await getRequirePhotoOnPunch(),
    pendingTasks: [
      ...pendingTasks.map((t) => ({
        id: t.id,
        kind: "TASK" as const,
        name: t.template.name,
        bonusAmount: t.bonusAmount ? Number(t.bonusAmount) : null,
      })),
      ...pendingSanitation.map((s) => ({
        id: s.id,
        kind: "SANITATION" as const,
        name: s.procedure.name,
        bonusAmount: null,
      })),
    ],
  });
}
