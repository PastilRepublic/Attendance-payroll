"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireOwner } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { SCHEDULE_LABELS } from "@/lib/sanitationLabels";

// Everything that shows sanitation data, so a change here is visible right away.
function revalidateSanitation() {
  revalidatePath("/admin/sanitation");
  revalidatePath("/sanitation");
}

// Blank means no bonus. Stored as a number so it can also clear an existing one.
const bonusAmountField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0), "Bonus must be a positive amount");

const procedureFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  steps: z.string().trim().min(1, "Cleaning instruction is required"),
  chemicals: z.string().trim().min(1, "Sanitizer agent is required"),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  timing: z.enum(["PRE_COOKING", "POST_COOKING", "ANYTIME"]),
  schedule: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  bonusAmount: bonusAmountField,
});

/** The two "Production day" checkboxes map onto the single appliesTo scope. */
function appliesToFrom(formData: FormData): "COOKING" | "JAR_FILLING" | "BOTH" {
  const cooking = formData.get("cookingDay") === "on";
  const jarFilling = formData.get("jarFillingDay") === "on";
  if (cooking && !jarFilling) return "COOKING";
  if (jarFilling && !cooking) return "JAR_FILLING";
  // Both ticked -- and a form with neither (the dialog blocks that) -- means every day.
  return "BOTH";
}

function readProcedureFields(formData: FormData) {
  return procedureFieldsSchema.parse({
    name: formData.get("name"),
    steps: formData.get("steps"),
    chemicals: formData.get("chemicals"),
    riskLevel: formData.get("riskLevel"),
    timing: formData.get("timing"),
    schedule: formData.get("schedule"),
    bonusAmount: formData.get("bonusAmount") || undefined,
  });
}

export async function createProcedure(formData: FormData) {
  const admin = await requireAdmin();
  const fields = readProcedureFields(formData);

  const procedure = await prisma.sanitationProcedure.create({
    data: {
      ...fields,
      appliesTo: appliesToFrom(formData),
      // The redesigned form no longer asks for these; keep the columns meaningful.
      areaEquipment: fields.name,
      frequency: SCHEDULE_LABELS[fields.schedule],
      responsibleRole: "Sanitation crew",
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "CREATE_SANITATION_PROCEDURE",
    targetTable: "SanitationProcedure",
    targetId: procedure.id,
    after: { name: procedure.name, schedule: procedure.schedule },
  });

  revalidateSanitation();
}

export async function updateProcedure(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  const fields = readProcedureFields(formData);

  const before = await prisma.sanitationProcedure.findUniqueOrThrow({ where: { id } });
  const procedure = await prisma.sanitationProcedure.update({
    where: { id },
    data: {
      ...fields,
      appliesTo: appliesToFrom(formData),
      frequency: SCHEDULE_LABELS[fields.schedule],
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_SANITATION_PROCEDURE",
    targetTable: "SanitationProcedure",
    targetId: procedure.id,
    before: {
      name: before.name,
      riskLevel: before.riskLevel,
      appliesTo: before.appliesTo,
      timing: before.timing,
      schedule: before.schedule,
    },
    after: {
      name: procedure.name,
      riskLevel: procedure.riskLevel,
      appliesTo: procedure.appliesTo,
      timing: procedure.timing,
      schedule: procedure.schedule,
    },
  });

  revalidateSanitation();
}

/** Deactivating hides a task from employees but keeps it (and its history) saved. */
export async function setProcedureActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  const active = formData.get("active") === "true";

  const procedure = await prisma.sanitationProcedure.update({ where: { id }, data: { active } });

  await logAudit({
    actorAdminId: admin.id,
    action: active ? "ACTIVATE_SANITATION_PROCEDURE" : "DEACTIVATE_SANITATION_PROCEDURE",
    targetTable: "SanitationProcedure",
    targetId: procedure.id,
    after: { name: procedure.name, active },
  });

  revalidateSanitation();
}

/** "Supervisor unavailable": while on, employees must photograph each duty they tick at the kiosk. */
export async function setSanitationPhotoRequired(formData: FormData) {
  const admin = await requireAdmin();
  const photoRequired = formData.get("photoRequired") === "true";

  await prisma.settings.upsert({
    where: { id: 1 },
    update: { sanitationPhotoRequired: photoRequired },
    create: { id: 1, sanitationPhotoRequired: photoRequired },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "SET_SANITATION_PHOTO_REQUIRED",
    targetTable: "Settings",
    targetId: "1",
    after: { photoRequired },
  });

  revalidateSanitation();
}

export async function setWeeklyCleaningDay(formData: FormData) {
  const admin = await requireAdmin();
  const weeklyDay = z.coerce.number().int().min(1).max(7).parse(formData.get("weeklyDay"));

  const before = await prisma.settings.findUnique({ where: { id: 1 } });
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { weeklyCleaningDay: weeklyDay },
    create: { id: 1, weeklyCleaningDay: weeklyDay },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "SET_WEEKLY_CLEANING_DAY",
    targetTable: "Settings",
    targetId: "1",
    before: { weeklyDay: before?.weeklyCleaningDay },
    after: { weeklyDay },
  });

  revalidateSanitation();
}

/** A blank date puts the month back to its default -- the last weekly-cleaning day of the month. */
export async function setMonthlyCleaningDate(formData: FormData) {
  const admin = await requireAdmin();
  const raw = z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .parse(formData.get("monthlyDate") ?? "");
  const monthlyDate = raw ? new Date(`${raw}T00:00:00.000Z`) : null;

  await prisma.settings.upsert({
    where: { id: 1 },
    update: { monthlyCleaningDate: monthlyDate },
    create: { id: 1, monthlyCleaningDate: monthlyDate },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "SET_MONTHLY_CLEANING_DATE",
    targetTable: "Settings",
    targetId: "1",
    after: { monthlyDate: raw || null },
  });

  revalidateSanitation();
}

const chemicalGuideSchema = z.object({
  product: z.string().trim().min(1, "Product is required"),
  strength: z.string().trim(),
  dilution: z.string().trim(),
});

/**
 * Owner-only. The guide counts as confirmed only once both the product strength and the
 * approved dilution are filled in -- until then employees are told to follow the label.
 */
export async function updateChemicalGuide(formData: FormData) {
  const admin = await requireOwner();
  const parsed = chemicalGuideSchema.parse({
    product: formData.get("product"),
    strength: formData.get("strength") ?? "",
    dilution: formData.get("dilution") ?? "",
  });
  const confirmed = parsed.strength !== "" && parsed.dilution !== "";

  const before = await prisma.settings.findUnique({ where: { id: 1 } });
  const data = {
    chemicalProduct: parsed.product,
    chemicalStrength: parsed.strength,
    chemicalDilution: parsed.dilution,
    // Keep the original confirmation time when just re-saving a confirmed guide.
    chemicalGuideConfirmedAt: confirmed ? (before?.chemicalGuideConfirmedAt ?? new Date()) : null,
  };
  await prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });

  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_CHEMICAL_GUIDE",
    targetTable: "Settings",
    targetId: "1",
    before: {
      product: before?.chemicalProduct,
      strength: before?.chemicalStrength,
      dilution: before?.chemicalDilution,
    },
    after: { ...parsed, confirmed },
  });

  revalidateSanitation();
}

const assignSanitationSchema = z.object({
  procedureId: z.string().min(1),
  date: z.string().min(1),
});

export async function assignSanitation(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = assignSanitationSchema.parse({
    procedureId: formData.get("procedureId"),
    date: formData.get("date"),
  });

  const assignment = await prisma.sanitationAssignment.create({
    data: {
      procedureId: parsed.procedureId,
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      assignedByAdminId: admin.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ASSIGN_SANITATION",
    targetTable: "SanitationAssignment",
    targetId: assignment.id,
    after: { procedureId: parsed.procedureId, date: parsed.date },
  });

  revalidateSanitation();
}

export async function deleteSanitationAssignment(formData: FormData) {
  const admin = await requireAdmin();
  const assignmentId = String(formData.get("assignmentId"));

  const assignment = await prisma.sanitationAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
  });

  if (assignment.inspectionResult) {
    throw new Error("This assignment has already been inspected and can no longer be removed here.");
  }

  await prisma.sanitationAssignment.delete({ where: { id: assignmentId } });

  await logAudit({
    actorAdminId: admin.id,
    action: "DELETE_SANITATION_ASSIGNMENT",
    targetTable: "SanitationAssignment",
    targetId: assignmentId,
    before: { employeeId: assignment.employeeId, status: assignment.status },
  });

  revalidateSanitation();
}

const inspectSchema = z.object({
  assignmentId: z.string().min(1),
  result: z.enum(["PASS", "FAIL"]),
  note: z.string().trim().optional(),
});

export async function inspectSanitationAssignment(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = inspectSchema.parse({
    assignmentId: formData.get("assignmentId"),
    result: formData.get("result"),
    note: formData.get("note") || undefined,
  });

  const assignment = await prisma.sanitationAssignment.update({
    where: { id: parsed.assignmentId },
    data: {
      inspectedByAdminId: admin.id,
      inspectedAt: new Date(),
      inspectionResult: parsed.result,
      inspectionNote: parsed.note,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "INSPECT_SANITATION_ASSIGNMENT",
    targetTable: "SanitationAssignment",
    targetId: assignment.id,
    after: { result: parsed.result, note: parsed.note },
  });

  revalidateSanitation();
}

const passAllSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Passes every duty on a date that is done but not yet inspected, in one
 * click. Pending duties and ones already inspected (passed or failed) are left
 * alone. Any admin (supervisor or owner) can use it -- same as inspecting one.
 */
export async function passAllSanitationAssignments(formData: FormData) {
  const admin = await requireAdmin();
  const { date } = passAllSchema.parse({ date: formData.get("date") });

  const waiting = await prisma.sanitationAssignment.findMany({
    where: {
      date: new Date(`${date}T00:00:00.000Z`),
      status: "DONE",
      inspectionResult: null,
    },
    select: { id: true },
  });

  if (waiting.length > 0) {
    await prisma.sanitationAssignment.updateMany({
      where: { id: { in: waiting.map((a) => a.id) }, inspectionResult: null },
      data: {
        inspectedByAdminId: admin.id,
        inspectedAt: new Date(),
        inspectionResult: "PASS",
      },
    });

    await logAudit({
      actorAdminId: admin.id,
      action: "PASS_ALL_SANITATION_ASSIGNMENTS",
      targetTable: "SanitationAssignment",
      targetId: date,
      after: { result: "PASS", count: waiting.length, ids: waiting.map((a) => a.id) },
    });
  }

  revalidateSanitation();
}

/**
 * Sets every duty on a date back to Pending -- clears who did it, when, and any
 * inspection. Owner-only since it erases sign-offs. Duties whose bonus already
 * went onto a payslip are left alone so a paid bonus never loses its duty.
 */
export async function resetSanitationDay(formData: FormData) {
  const admin = await requireOwner();
  const { date } = passAllSchema.parse({ date: formData.get("date") });

  const result = await prisma.sanitationAssignment.updateMany({
    where: { date: new Date(`${date}T00:00:00.000Z`), payslipAdjustmentId: null },
    data: {
      status: "PENDING",
      completedAt: null,
      employeeId: null,
      photoUrl: null,
      inspectedByAdminId: null,
      inspectedAt: null,
      inspectionResult: null,
      inspectionNote: null,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "RESET_SANITATION_DAY",
    targetTable: "SanitationAssignment",
    targetId: date,
    after: { count: result.count },
  });

  revalidateSanitation();
}
