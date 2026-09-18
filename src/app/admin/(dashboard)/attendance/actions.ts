"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { TIMEZONE } from "@/lib/payroll";
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
  reason: z.string().trim().min(3, "A reason is required (min 3 characters)"),
});

const SLOT_TYPES = [
  { field: "timeIn", type: "IN" },
  { field: "breakStart", type: "BREAK_START" },
  { field: "breakEnd", type: "BREAK_END" },
  { field: "timeOut", type: "OUT" },
] as const;

function nextDayKey(dateStr: string): string {
  return new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
}

/**
 * Sets one employee's Time In / Start Break / End Break / Time Out for a day
 * from four fixed fields. For each slot: a blank field removes that punch, a
 * changed time replaces it, and an unchanged time is left alone. A slot that
 * somehow has several punches of the same type is collapsed to the one value
 * in the field. Replaced punches are voided (never deleted) and the new ones
 * carry the reason, so every correction stays visible in the audit trail.
 */
export async function saveDayPunches(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = dayPunchesSchema.parse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    timeIn: formData.get("timeIn") ?? "",
    breakStart: formData.get("breakStart") ?? "",
    breakEnd: formData.get("breakEnd") ?? "",
    timeOut: formData.get("timeOut") ?? "",
    reason: formData.get("reason"),
  });

  const entered = SLOT_TYPES.filter((s) => parsed[s.field] !== "");
  for (let i = 1; i < entered.length; i++) {
    if (parsed[entered[i].field] <= parsed[entered[i - 1].field]) {
      throw new Error("Times must be in order: Time In, Start Break, End Break, Time Out.");
    }
  }

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

  const voidIds: string[] = [];
  const created: { type: (typeof SLOT_TYPES)[number]["type"]; time: string; from: string | null }[] = [];
  const before: { type: string; time: string }[] = [];

  for (const slot of SLOT_TYPES) {
    const current = existing.filter((p) => p.type === slot.type);
    const wanted = parsed[slot.field];
    const currentTimes = current.map((p) => formatInTimeZone(p.timestamp, TIMEZONE, "HH:mm"));
    const unchanged =
      wanted === "" ? current.length === 0 : current.length === 1 && currentTimes[0] === wanted;
    if (unchanged) continue;

    for (const p of current) {
      voidIds.push(p.id);
      before.push({ type: slot.type, time: formatInTimeZone(p.timestamp, TIMEZONE, "HH:mm") });
    }
    if (wanted !== "") created.push({ type: slot.type, time: wanted, from: current[0]?.id ?? null });
  }

  if (voidIds.length === 0 && created.length === 0) return;

  await prisma.$transaction([
    prisma.punch.updateMany({ where: { id: { in: voidIds } }, data: { voided: true } }),
    ...created.map((c) =>
      prisma.punch.create({
        data: {
          employeeId: parsed.employeeId,
          timestamp: localToUtc(parsed.date, c.time),
          type: c.type,
          isCorrection: true,
          correctedFromPunchId: c.from,
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
    before,
    after: created.map((c) => ({ type: c.type, time: c.time })),
    reason: parsed.reason,
  });

  revalidatePath("/admin/attendance");
}

const dayStatusSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1),
  status: z.enum(["NORMAL", "PAID_LEAVE", "UNPAID_ABSENCE"]),
});

export async function setDayStatus(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = dayStatusSchema.parse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    status: formData.get("status"),
  });

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
}
