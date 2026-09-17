"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { TIMEZONE } from "@/lib/payroll";
import { fromZonedTime } from "date-fns-tz";

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

const addPunchSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  type: z.enum(["IN", "OUT"]),
  reason: z.string().trim().min(3, "A reason is required (min 3 characters)"),
});

export async function addPunch(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = addPunchSchema.parse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    time: formData.get("time"),
    type: formData.get("type"),
    reason: formData.get("reason"),
  });

  const punch = await prisma.punch.create({
    data: {
      employeeId: parsed.employeeId,
      timestamp: localToUtc(parsed.date, parsed.time),
      type: parsed.type,
      isCorrection: true,
      correctionReason: parsed.reason,
      createdByAdminId: admin.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_PUNCH",
    targetTable: "Punch",
    targetId: punch.id,
    after: { timestamp: punch.timestamp, type: punch.type },
    reason: parsed.reason,
  });

  revalidatePath("/admin/attendance");
}

const editPunchSchema = z.object({
  punchId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  type: z.enum(["IN", "OUT"]),
  reason: z.string().trim().min(3, "A reason is required (min 3 characters)"),
});

export async function editPunch(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = editPunchSchema.parse({
    punchId: formData.get("punchId"),
    date: formData.get("date"),
    time: formData.get("time"),
    type: formData.get("type"),
    reason: formData.get("reason"),
  });

  const original = await prisma.punch.findUniqueOrThrow({ where: { id: parsed.punchId } });

  const [, replacement] = await prisma.$transaction([
    prisma.punch.update({
      where: { id: original.id },
      data: { voided: true },
    }),
    prisma.punch.create({
      data: {
        employeeId: original.employeeId,
        timestamp: localToUtc(parsed.date, parsed.time),
        type: parsed.type,
        isCorrection: true,
        correctedFromPunchId: original.id,
        correctionReason: parsed.reason,
        createdByAdminId: admin.id,
      },
    }),
  ]);

  await logAudit({
    actorAdminId: admin.id,
    action: "EDIT_PUNCH",
    targetTable: "Punch",
    targetId: original.id,
    before: { timestamp: original.timestamp, type: original.type, voided: false },
    after: { timestamp: replacement.timestamp, type: replacement.type, replacementId: replacement.id },
    reason: parsed.reason,
  });

  revalidatePath("/admin/attendance");
}

const voidPunchSchema = z.object({
  punchId: z.string().min(1),
  reason: z.string().trim().min(3, "A reason is required (min 3 characters)"),
});

export async function voidPunch(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = voidPunchSchema.parse({
    punchId: formData.get("punchId"),
    reason: formData.get("reason"),
  });

  const original = await prisma.punch.findUniqueOrThrow({ where: { id: parsed.punchId } });

  await prisma.punch.update({
    where: { id: original.id },
    data: { voided: true },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "VOID_PUNCH",
    targetTable: "Punch",
    targetId: original.id,
    before: { timestamp: original.timestamp, type: original.type, voided: false },
    after: { voided: true },
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
