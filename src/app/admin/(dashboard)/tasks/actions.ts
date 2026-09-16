"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
});

export async function createTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = createTemplateSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  const template = await prisma.taskTemplate.create({
    data: { name: parsed.name, description: parsed.description },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "CREATE_TASK_TEMPLATE",
    targetTable: "TaskTemplate",
    targetId: template.id,
    after: { name: template.name },
  });

  revalidatePath("/admin/tasks");
}

const assignTaskSchema = z.object({
  templateId: z.string().min(1),
  employeeId: z.string().min(1),
  date: z.string().min(1),
  bonusAmount: z.string().optional(),
});

export async function assignTask(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = assignTaskSchema.parse({
    templateId: formData.get("templateId"),
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    bonusAmount: formData.get("bonusAmount") || undefined,
  });

  const bonusAmount =
    parsed.bonusAmount && parsed.bonusAmount.trim() !== ""
      ? Number(parsed.bonusAmount)
      : null;

  const assignment = await prisma.taskAssignment.create({
    data: {
      templateId: parsed.templateId,
      employeeId: parsed.employeeId,
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      bonusAmount: bonusAmount ?? undefined,
      assignedByAdminId: admin.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ASSIGN_TASK",
    targetTable: "TaskAssignment",
    targetId: assignment.id,
    after: { templateId: parsed.templateId, employeeId: parsed.employeeId, bonusAmount },
  });

  revalidatePath("/admin/tasks");
}

export async function deleteAssignment(formData: FormData) {
  const admin = await requireAdmin();
  const assignmentId = String(formData.get("assignmentId"));

  const assignment = await prisma.taskAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
  });

  if (assignment.payslipAdjustmentId) {
    throw new Error(
      "This task's bonus has already been added to a payslip and can no longer be removed here."
    );
  }

  await prisma.taskAssignment.delete({ where: { id: assignmentId } });

  await logAudit({
    actorAdminId: admin.id,
    action: "DELETE_TASK_ASSIGNMENT",
    targetTable: "TaskAssignment",
    targetId: assignmentId,
    before: { employeeId: assignment.employeeId, status: assignment.status },
  });

  revalidatePath("/admin/tasks");
}
