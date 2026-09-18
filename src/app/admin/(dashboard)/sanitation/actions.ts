"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// Blank means no bonus. Stored as a number so it can also clear an existing one.
const bonusAmountField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0), "Bonus must be a positive amount");

const createProcedureSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  areaEquipment: z.string().trim().min(1, "Area/Equipment is required"),
  chemicals: z.string().trim().min(1, "Chemicals is required"),
  steps: z.string().trim().min(1, "Steps is required"),
  frequency: z.string().trim().min(1, "Frequency is required"),
  responsibleRole: z.string().trim().min(1, "Responsible role is required"),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  appliesTo: z.enum(["COOKING", "JAR_FILLING", "BOTH"]),
  timing: z.enum(["PRE_COOKING", "POST_COOKING", "ANYTIME"]),
  bonusAmount: bonusAmountField,
});

export async function createProcedure(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = createProcedureSchema.parse({
    name: formData.get("name"),
    areaEquipment: formData.get("areaEquipment"),
    chemicals: formData.get("chemicals"),
    steps: formData.get("steps"),
    frequency: formData.get("frequency"),
    responsibleRole: formData.get("responsibleRole"),
    riskLevel: formData.get("riskLevel"),
    appliesTo: formData.get("appliesTo"),
    timing: formData.get("timing"),
    bonusAmount: formData.get("bonusAmount") || undefined,
  });

  const procedure = await prisma.sanitationProcedure.create({ data: parsed });

  await logAudit({
    actorAdminId: admin.id,
    action: "CREATE_SANITATION_PROCEDURE",
    targetTable: "SanitationProcedure",
    targetId: procedure.id,
    after: { name: procedure.name },
  });

  revalidatePath("/admin/sanitation");
  revalidatePath("/sanitation");
}

const updateProcedureSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  areaEquipment: z.string().trim().min(1, "Area/Equipment is required"),
  chemicals: z.string().trim().min(1, "Chemicals is required"),
  steps: z.string().trim().min(1, "Steps is required"),
  frequency: z.string().trim().min(1, "Frequency is required"),
  responsibleRole: z.string().trim().min(1, "Responsible role is required"),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  appliesTo: z.enum(["COOKING", "JAR_FILLING", "BOTH"]),
  timing: z.enum(["PRE_COOKING", "POST_COOKING", "ANYTIME"]),
  bonusAmount: bonusAmountField,
});

export async function updateProcedure(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = updateProcedureSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    areaEquipment: formData.get("areaEquipment"),
    chemicals: formData.get("chemicals"),
    steps: formData.get("steps"),
    frequency: formData.get("frequency"),
    responsibleRole: formData.get("responsibleRole"),
    riskLevel: formData.get("riskLevel"),
    appliesTo: formData.get("appliesTo"),
    timing: formData.get("timing"),
    bonusAmount: formData.get("bonusAmount") || undefined,
  });
  const { id, ...data } = parsed;

  const before = await prisma.sanitationProcedure.findUniqueOrThrow({ where: { id } });
  const procedure = await prisma.sanitationProcedure.update({ where: { id }, data });

  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_SANITATION_PROCEDURE",
    targetTable: "SanitationProcedure",
    targetId: procedure.id,
    before: { name: before.name, riskLevel: before.riskLevel, appliesTo: before.appliesTo, timing: before.timing },
    after: { name: procedure.name, riskLevel: procedure.riskLevel, appliesTo: procedure.appliesTo, timing: procedure.timing },
  });

  revalidatePath("/admin/sanitation");
  revalidatePath("/sanitation");
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

  revalidatePath("/admin/sanitation");
  revalidatePath("/sanitation");
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

  revalidatePath("/admin/sanitation");
  revalidatePath("/sanitation");
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

  revalidatePath("/admin/sanitation");
  revalidatePath("/sanitation");
}
