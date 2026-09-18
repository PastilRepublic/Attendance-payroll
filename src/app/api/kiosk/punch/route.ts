import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { savePunchPhoto } from "@/lib/storage";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import type { PunchType } from "@/lib/payroll";
import { getAllowedActions, getKioskSnapshot } from "@/lib/kioskAttendance";

const PUNCH_TYPES: PunchType[] = ["IN", "OUT", "BREAK_START", "BREAK_END"];

const GUARD_MESSAGES: Record<string, { error: string; message: string }> = {
  OUT: {
    error: "NOT_TIMED_IN",
    message: "You haven't timed in yet today. Please see your admin for assistance.",
  },
  BREAK_START: {
    error: "CANNOT_START_BREAK",
    message: "You need to time in before starting a break.",
  },
  BREAK_END: {
    error: "CANNOT_END_BREAK",
    message: "You're not currently on a break.",
  },
  IN: {
    error: "ALREADY_TIMED_IN",
    message: "You're already timed in.",
  },
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
  const photoDataUrl = typeof body?.photoDataUrl === "string" ? body.photoDataUrl : null;
  const requestedType: PunchType | null = PUNCH_TYPES.includes(body?.type) ? body.type : null;

  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const matched = await resolveEmployeeByPin(pin, employeeId);
  if (!matched) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  if (deviceId) {
    await prisma.device.upsert({
      where: { id: deviceId },
      update: {},
      create: { id: deviceId, label: `Unregistered device (${deviceId.slice(0, 8)})` },
    });
  }

  const snapshotBefore = await getKioskSnapshot(matched.id);

  // The employee explicitly picks an action on the kiosk now (rather than a
  // silent auto-toggle), so an explicit choice is honored here. Only when
  // none is given (e.g. an older queued offline punch built against the
  // pre-break two-state toggle) do we fall back to auto-deriving it, and
  // that fallback never infers a break type.
  let type: PunchType;
  if (requestedType) {
    type = requestedType;
  } else {
    type = snapshotBefore.status === "OUT" ? "IN" : "OUT";
  }

  if (!getAllowedActions(snapshotBefore.status).includes(type)) {
    if (snapshotBefore.status === "DONE") {
      return NextResponse.json(
        {
          error: "ALREADY_COMPLETED",
          message: "You've already completed your shift for today. See your admin if this is a mistake.",
        },
        { status: 409 }
      );
    }
    const guard = GUARD_MESSAGES[type];
    return NextResponse.json(
      { error: guard.error, message: guard.message },
      { status: 409 }
    );
  }

  const punch = await prisma.punch.create({
    data: {
      employeeId: matched.id,
      type,
      deviceId: deviceId ?? undefined,
      timestamp: new Date(),
    },
  });

  if (photoDataUrl) {
    try {
      const photoPath = await savePunchPhoto(punch.id, photoDataUrl);
      await prisma.punch.update({ where: { id: punch.id }, data: { photoPath } });
    } catch (err) {
      // Photo capture failing should never lose the punch itself.
      console.error("[punch] photo save failed:", err);
    }
  }

  const snapshotAfter = await getKioskSnapshot(matched.id);

  return NextResponse.json({
    employeeName: matched.name,
    type,
    timestamp: punch.timestamp,
    status: snapshotAfter.status,
    allowedActions: snapshotAfter.allowedActions,
    activityLog: snapshotAfter.activityLog,
    totals: snapshotAfter.totals,
  });
}
