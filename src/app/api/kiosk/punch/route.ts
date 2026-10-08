import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { savePunchPhoto } from "@/lib/storage";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getKioskSnapshot } from "@/lib/kioskAttendance";
import { localDateKey, TIMEZONE, type PunchType } from "@/lib/payroll";
import { dayStateAfter, firstInvalidPunch, resolvePunchTime } from "@/lib/punchRules";
import { findFinalizedPeriodCovering, finalizedPeriodMessage } from "@/lib/payPeriodLock";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";

const PUNCH_TYPES: PunchType[] = ["IN", "OUT", "BREAK_START", "BREAK_END"];

class PunchRejected extends Error {
  constructor(public body: { error: string; message: string }) {
    super(body.message);
  }
}

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
  // Set only by the kiosk offline queue: when the punch actually happened.
  const queuedAt = typeof body?.queuedAt === "string" ? body.queuedAt : null;

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

  const when = resolvePunchTime(queuedAt);
  if (!when.ok) {
    return NextResponse.json({ error: when.error, message: when.message }, { status: 409 });
  }
  const timestamp = when.timestamp;
  const dayKey = localDateKey(timestamp);
  const dayStart = fromZonedTime(`${dayKey}T00:00:00`, TIMEZONE);
  const dayEnd = addDays(dayStart, 1);

  let punch;
  try {
    punch = await prisma.$transaction(async (tx) => {
      // Serialize punches per employee: without this, a double tap (or an
      // offline sync racing a live punch) could pass the check below twice
      // and record two Time Ins.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${matched.id}::text))`;

      if (when.backdated) {
        const finalized = await findFinalizedPeriodCovering(matched.id, dayKey, tx);
        if (finalized) {
          throw new PunchRejected({ error: "PERIOD_FINALIZED", message: finalizedPeriodMessage(finalized) });
        }
      }

      const dayPunches = await tx.punch.findMany({
        where: { employeeId: matched.id, voided: false, timestamp: { gte: dayStart, lt: dayEnd } },
        orderBy: { timestamp: "asc" },
        select: { type: true, timestamp: true },
      });
      const before = dayPunches.filter((p) => p.timestamp <= timestamp);
      const after = dayPunches.filter((p) => p.timestamp > timestamp);
      const state = dayStateAfter(before);

      // The employee explicitly picks an action on the kiosk now (rather than a
      // silent auto-toggle), so an explicit choice is honored here. Only when
      // none is given (e.g. an older queued offline punch built against the
      // pre-break two-state toggle) do we fall back to auto-deriving it, and
      // that fallback never infers a break type.
      const type: PunchType = requestedType ?? (state.status === "OUT" ? "IN" : "OUT");

      if (!state.allowedActions.includes(type)) {
        if (state.status === "DONE") {
          throw new PunchRejected({
            error: "ALREADY_COMPLETED",
            message: "You've already completed your shift for today. See your admin if this is a mistake.",
          });
        }
        if (type === "BREAK_START" && state.status === "WORKING") {
          throw new PunchRejected({
            error: "BREAK_ALREADY_USED",
            message: "You've already used your break for today.",
          });
        }
        throw new PunchRejected(GUARD_MESSAGES[type]);
      }
      // A synced offline punch may land before punches already recorded that
      // day; it must still leave the whole day in a valid order.
      if (after.length > 0 && firstInvalidPunch([...before, { type, timestamp }, ...after]) !== -1) {
        throw new PunchRejected({
          error: "OUT_OF_ORDER",
          message: "This punch conflicts with punches already recorded for that day. Please see your admin.",
        });
      }

      return tx.punch.create({
        data: {
          employeeId: matched.id,
          type,
          deviceId: deviceId ?? undefined,
          timestamp,
        },
      });
    });
  } catch (err) {
    if (err instanceof PunchRejected) {
      return NextResponse.json(err.body, { status: 409 });
    }
    throw err;
  }
  const type = punch.type;

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
