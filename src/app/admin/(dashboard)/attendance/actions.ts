"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { TIMEZONE } from "@/lib/payroll";
import { pickDaySlots } from "@/lib/attendanceSlots";
import { validateDayEdit } from "@/lib/punchRules";
import { findFinalizedPeriodCovering, finalizedPeriodMessage } from "@/lib/payPeriodLock";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

function localToUtc(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TIMEZONE);
}

const shiftOverrideSchema = z.object({
  date: z.string().min(1),
  shiftStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEndTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function setShiftOverride(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = shiftOverrideSchema.parse({
    date: formData.get("date"),
    shiftStartTime: formData.get("shiftStartTime"),
    shiftEndTime: formData.get("shiftEndTime"),
  });

  const date = new Date(`${parsed.date}T00:00:00.000Z`);
  const override = await prisma.shiftOverride.upsert({
    where: { date },
    update: { shiftStartTime: parsed.shiftStartTime, shiftEndTime: parsed.shiftEndTime, setByAdminId: admin.id },
    create: {
      date,
      shiftStartTime: parsed.shiftStartTime,
      shiftEndTime: parsed.shiftEndTime,
      setByAdminId: admin.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "SET_SHIFT_OVERRIDE",
    targetTable: "ShiftOverride",
    targetId: override.id,
    after: { date: parsed.date, shiftStartTime: parsed.shiftStartTime, shiftEndTime: parsed.shiftEndTime },
  });

  revalidatePath("/admin/attendance");
}

export async function removeShiftOverride(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("overrideId"));

  const existing = await prisma.shiftOverride.findUniqueOrThrow({ where: { id } });
  await prisma.shiftOverride.delete({ where: { id } });

  await logAudit({
    actorAdminId: admin.id,
    action: "REMOVE_SHIFT_OVERRIDE",
    targetTable: "ShiftOverride",
    targetId: id,
    before: {
      date: existing.date.toISOString().slice(0, 10),
      shiftStartTime: existing.shiftStartTime,
      shiftEndTime: existing.shiftEndTime,
    },
  });

  revalidatePath("/admin/attendance");
}

const timeField = z.string().regex(/^[0-9]{2}:[0-9]{2}$/).or(z.literal(""));

const dayPunchesSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  timeIn: timeField,
  breakStart: timeField,
  breakEnd: timeField,
  timeOut: timeField,
  // Optional: a blank reason is stored as none. The punch is still marked as corrected.
  reason: z.string().trim().optional().transform((v) => v || undefined),
});

const SLOT_TYPES = [
  { field: "timeIn", type: "IN" },
  { field: "breakStart", type: "BREAK_START" },
  { field: "breakEnd", type: "BREAK_END" },
  { field: "timeOut", type: "OUT" },
] as const;

/** Result of a Manage-day form submit, shown inline by the form (see ManageDayForms). */
export type DayFormState = { error?: string; savedAt?: number };

function nextDayKey(dateStr: string): string {
  return new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
}

/**
 * Sets one employee's Time In / Start Break / End Break / Time Out for a day
 * from four fixed fields. Each slot keeps a single punch: a changed time
 * updates that punch in place (marked as corrected, with the reason), a blank
 * field removes it, and a filled field with no punch yet adds one. Extra
 * punches of the same type (from older edits) are removed so each slot is
 * one row. Nothing is hard-deleted, and the audit log records the old and new
 * times with the reason, so a correction stays traceable without piling up
 * replacement rows.
 */
export async function saveDayPunches(_prev: DayFormState, formData: FormData): Promise<DayFormState> {
  const admin = await requireAdmin();
  const result = dayPunchesSchema.safeParse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    timeIn: formData.get("timeIn") ?? "",
    breakStart: formData.get("breakStart") ?? "",
    breakEnd: formData.get("breakEnd") ?? "",
    timeOut: formData.get("timeOut") ?? "",
    reason: formData.get("reason") ?? undefined,
  });
  if (!result.success) return { error: "Please enter valid times (HH:MM)." };
  const parsed = result.data;

  const now = new Date();
  const invalid = validateDayEdit(
    parsed,
    parsed.date,
    formatInTimeZone(now, TIMEZONE, "yyyy-MM-dd"),
    formatInTimeZone(now, TIMEZONE, "HH:mm")
  );
  if (invalid) return { error: invalid };

  const finalized = await findFinalizedPeriodCovering(parsed.date);
  if (finalized) return { error: finalizedPeriodMessage(finalized) };

  const existing = await prisma.punch.findMany({
    where: {
      employeeId: parsed.employeeId,
      voided: false,
      timestamp: {
        gte: localToUtc(parsed.date, "00:00"),
        lt: localToUtc(nextDayKey(parsed.date), "00:00"),
      },
    },
    orderBy: { timestamp: "asc" },
  });

  const clearingAll = SLOT_TYPES.every((s) => parsed[s.field] === "");
  if (clearingAll && existing.length > 0 && !parsed.reason) {
    return { error: "Enter a reason to remove every punch for this day." };
  }

  const kept = pickDaySlots(existing);
  const keptBySlot = {
    timeIn: kept.timeIn,
    breakStart: kept.breakStart,
    breakEnd: kept.breakEnd,
    timeOut: kept.timeOut,
  };
  const hhmm = (d: Date) => formatInTimeZone(d, TIMEZONE, "HH:mm");

  const voidIds: string[] = [];
  const updates: { id: string; time: string }[] = [];
  const creates: { type: (typeof SLOT_TYPES)[number]["type"]; time: string }[] = [];
  const changes: { type: string; from: string | null; to: string | null }[] = [];

  for (const slot of SLOT_TYPES) {
    const keep = keptBySlot[slot.field];
    const wanted = parsed[slot.field];
    const extras = existing.filter((p) => p.type === slot.type && p.id !== keep?.id);

    for (const p of extras) {
      voidIds.push(p.id);
      changes.push({ type: slot.type, from: hhmm(p.timestamp), to: null });
    }

    if (wanted === "") {
      if (keep) {
        voidIds.push(keep.id);
        changes.push({ type: slot.type, from: hhmm(keep.timestamp), to: null });
      }
    } else if (!keep) {
      creates.push({ type: slot.type, time: wanted });
      changes.push({ type: slot.type, from: null, to: wanted });
    } else if (hhmm(keep.timestamp) !== wanted) {
      updates.push({ id: keep.id, time: wanted });
      changes.push({ type: slot.type, from: hhmm(keep.timestamp), to: wanted });
    }
  }

  if (changes.length === 0) return { savedAt: Date.now() };

  await prisma.$transaction([
    prisma.punch.updateMany({ where: { id: { in: voidIds } }, data: { voided: true } }),
    ...updates.map((u) =>
      prisma.punch.update({
        where: { id: u.id },
        data: {
          timestamp: localToUtc(parsed.date, u.time),
          isCorrection: true,
          correctionReason: parsed.reason,
          createdByAdminId: admin.id,
        },
      })
    ),
    ...creates.map((c) =>
      prisma.punch.create({
        data: {
          employeeId: parsed.employeeId,
          timestamp: localToUtc(parsed.date, c.time),
          type: c.type,
          isCorrection: true,
          correctionReason: parsed.reason,
          createdByAdminId: admin.id,
        },
      })
    ),
  ]);

  await logAudit({
    actorAdminId: admin.id,
    action: "EDIT_DAY_PUNCHES",
    targetTable: "Punch",
    targetId: `${parsed.employeeId}:${parsed.date}`,
    after: { changes },
    reason: parsed.reason,
  });

  revalidatePath("/admin/attendance");
  return { savedAt: Date.now() };
}

const dayStatusSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  status: z.enum(["NORMAL", "PAID_LEAVE", "UNPAID_ABSENCE"]),
});

export async function setDayStatus(_prev: DayFormState, formData: FormData): Promise<DayFormState> {
  const admin = await requireAdmin();
  const result = dayStatusSchema.safeParse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    status: formData.get("status"),
  });
  if (!result.success) return { error: "Please choose a valid status." };
  const parsed = result.data;

  const finalized = await findFinalizedPeriodCovering(parsed.date);
  if (finalized) return { error: finalizedPeriodMessage(finalized) };

  const existing = await prisma.dayStatus.findUnique({
    where: { employeeId_date: { employeeId: parsed.employeeId, date: new Date(`${parsed.date}T00:00:00.000Z`) } },
  });

  if (parsed.status === "NORMAL") {
    if (existing) {
      await prisma.dayStatus.delete({ where: { id: existing.id } });
      await logAudit({
        actorAdminId: admin.id,
        action: "CLEAR_DAY_STATUS",
        targetTable: "DayStatus",
        targetId: existing.id,
        before: { status: existing.status },
      });
    }
  } else if (existing) {
    await prisma.dayStatus.update({
      where: { id: existing.id },
      data: { status: parsed.status, setByAdminId: admin.id },
    });
    await logAudit({
      actorAdminId: admin.id,
      action: "UPDATE_DAY_STATUS",
      targetTable: "DayStatus",
      targetId: existing.id,
      before: { status: existing.status },
      after: { status: parsed.status },
    });
  } else {
    const created = await prisma.dayStatus.create({
      data: {
        employeeId: parsed.employeeId,
        date: new Date(`${parsed.date}T00:00:00.000Z`),
        status: parsed.status,
        setByAdminId: admin.id,
      },
    });
    await logAudit({
      actorAdminId: admin.id,
      action: "SET_DAY_STATUS",
      targetTable: "DayStatus",
      targetId: created.id,
      after: { status: created.status },
    });
  }

  revalidatePath("/admin/attendance");
  return { savedAt: Date.now() };
}
