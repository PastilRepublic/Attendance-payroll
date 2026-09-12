"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { nextWeeklyPeriod } from "@/lib/payroll";
import { getOrRefreshDraftPayslip } from "@/lib/payrollService";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

export async function createNextPayPeriod() {
  const admin = await requireAdmin();

  const latest = await prisma.payPeriod.findFirst({ orderBy: { endDate: "desc" } });
  const after = latest ? new Date(latest.endDate.getTime() + 86400000) : new Date();
  const { start, end } = nextWeeklyPeriod(after);

  const period = await prisma.payPeriod.create({
    data: {
      startDate: new Date(`${start}T00:00:00.000Z`),
      endDate: new Date(`${end}T00:00:00.000Z`),
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "CREATE_PAY_PERIOD",
    targetTable: "PayPeriod",
    targetId: period.id,
    after: { startDate: start, endDate: end },
  });

  revalidatePath("/admin/payroll");
  redirect(`/admin/payroll/${period.id}`);
}

const adjustmentSchema = z.object({
  payslipId: z.string().min(1),
  label: z.string().trim().min(1),
  amount: z.coerce.number().refine((n) => n !== 0, "Amount cannot be zero"),
  note: z.string().trim().optional(),
});

export async function addAdjustment(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = adjustmentSchema.parse({
    payslipId: formData.get("payslipId"),
    label: formData.get("label"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });

  const payslip = await prisma.payslip.findUniqueOrThrow({ where: { id: parsed.payslipId } });
  if (payslip.status === "FINALIZED") {
    throw new Error("This payslip is finalized. Unlock it first to make changes.");
  }

  const adjustment = await prisma.payslipAdjustment.create({
    data: {
      payslipId: parsed.payslipId,
      label: parsed.label,
      amount: parsed.amount,
      note: parsed.note,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_ADJUSTMENT",
    targetTable: "PayslipAdjustment",
    targetId: adjustment.id,
    after: { label: parsed.label, amount: parsed.amount, note: parsed.note },
  });

  revalidatePath(`/admin/payroll/${payslip.payPeriodId}`);
}

export async function removeAdjustment(formData: FormData) {
  const admin = await requireAdmin();
  const adjustmentId = String(formData.get("adjustmentId"));

  const adjustment = await prisma.payslipAdjustment.findUniqueOrThrow({
    where: { id: adjustmentId },
    include: { payslip: true },
  });
  if (adjustment.payslip.status === "FINALIZED") {
    throw new Error("This payslip is finalized. Unlock it first to make changes.");
  }

  await prisma.payslipAdjustment.delete({ where: { id: adjustmentId } });

  await logAudit({
    actorAdminId: admin.id,
    action: "REMOVE_ADJUSTMENT",
    targetTable: "PayslipAdjustment",
    targetId: adjustmentId,
    before: { label: adjustment.label, amount: Number(adjustment.amount) },
  });

  revalidatePath(`/admin/payroll/${adjustment.payslip.payPeriodId}`);
}

export async function finalizePeriod(formData: FormData) {
  const admin = await requireAdmin();
  const payPeriodId = String(formData.get("payPeriodId"));

  const period = await prisma.payPeriod.findUniqueOrThrow({ where: { id: payPeriodId } });
  if (period.status === "FINALIZED") return;

  const employees = await prisma.employee.findMany({ where: { active: true } });

  for (const emp of employees) {
    const payslip = await getOrRefreshDraftPayslip(emp.id, payPeriodId);
    if (payslip.status !== "FINALIZED") {
      await prisma.payslip.update({ where: { id: payslip.id }, data: { status: "FINALIZED" } });
    }
  }

  await prisma.payPeriod.update({
    where: { id: payPeriodId },
    data: { status: "FINALIZED", finalizedAt: new Date(), finalizedByAdminId: admin.id },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "FINALIZE_PAY_PERIOD",
    targetTable: "PayPeriod",
    targetId: payPeriodId,
  });

  revalidatePath(`/admin/payroll/${payPeriodId}`);
  revalidatePath("/admin/payroll");
}

const unlockSchema = z.object({
  payslipId: z.string().min(1),
  reason: z.string().trim().min(3, "A reason is required (min 3 characters)"),
});

export async function unlockPayslip(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = unlockSchema.parse({
    payslipId: formData.get("payslipId"),
    reason: formData.get("reason"),
  });

  const payslip = await prisma.payslip.findUniqueOrThrow({ where: { id: parsed.payslipId } });

  await prisma.payslip.update({ where: { id: payslip.id }, data: { status: "DRAFT" } });
  await prisma.payPeriod.update({
    where: { id: payslip.payPeriodId },
    data: { status: "OPEN" },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "UNLOCK_PAYSLIP",
    targetTable: "Payslip",
    targetId: payslip.id,
    reason: parsed.reason,
  });

  revalidatePath(`/admin/payroll/${payslip.payPeriodId}`);
}
