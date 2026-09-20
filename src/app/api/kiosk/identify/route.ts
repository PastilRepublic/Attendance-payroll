import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getRequirePhotoOnPunch, getOperationDay } from "@/lib/settings";
import { TIMEZONE } from "@/lib/payroll";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getKioskSnapshot, countCoworkersStillIn } from "@/lib/kioskAttendance";
import {
  chemicalGuideText,
  ensureTodaysSanitationSchedule,
  getSanitationSettings,
  scopeFilterFor,
} from "@/lib/sanitation";

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

  // Packing team (flat daily rate) isn't part of the cooking / jar filling
  // cleanup, so they never get the checklist -- Time In/Out works as normal.
  const employeeRecord = await prisma.employee.findUnique({
    where: { id: matched.id },
    select: { payBasis: true },
  });
  const skipsChecklist = isActiveSupervisor || employeeRecord?.payBasis === "FLAT_DAILY";

  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  if (!skipsChecklist) {
    await ensureTodaysSanitationSchedule();
  }
  const operationDay = await getOperationDay();
  const sanitationSettings = await getSanitationSettings();
  // Bonus tasks are no longer shown at the kiosk -- only cleaning duties.
  const pendingSanitation = skipsChecklist
    ? []
    : await prisma.sanitationAssignment.findMany({
        where: {
          date: new Date(`${today}T00:00:00.000Z`),
          status: "PENDING",
          OR: [{ employeeId: null }, { employeeId: matched.id }],
          procedure: { appliesTo: scopeFilterFor(operationDay) },
        },
        include: { procedure: true },
      });

  return NextResponse.json({
    employeeId: matched.id,
    employeeName: matched.name,
    nextType,
    status: snapshot.status,
    allowedActions: snapshot.allowedActions,
    activityLog: snapshot.activityLog,
    totals: snapshot.totals,
    // Packing (flat daily) can go home whenever they're done, so no half-day prompt.
    exemptFromHalfDay: employeeRecord?.payBasis === "FLAT_DAILY",
    requirePhoto: await getRequirePhotoOnPunch(),
    sanitationPhotoRequired: sanitationSettings.photoRequired,
    chemicalGuide: chemicalGuideText(sanitationSettings.chemicalGuide),
    coworkersStillIn: await countCoworkersStillIn(matched.id),
    pendingTasks: [
      ...pendingSanitation.map((s) => ({
        id: s.id,
        kind: "SANITATION" as const,
        name: s.procedure.name,
        timing: s.procedure.timing,
        bonusAmount: null,
      })),
    ],
  });
}
