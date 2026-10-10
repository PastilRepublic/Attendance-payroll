"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runForm, type FormState } from "@/lib/formAction";
import { numberText } from "@/lib/numberInput";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { isEarlyOutDay, localDateKey } from "@/lib/payroll";
import { nextPeriodToCreate } from "@/lib/payPeriods";
import {
  getOrRefreshDraftPayslip,
  getPeriodDailyResults,
  getEmployeePeriodReview,
  finalizeIssues,
  hasFinalizeIssues,
} from "@/lib/payrollService";
import { getSettings, getOperationDayOverrides, setOperationDayForDate } from "@/lib/settings";

export async function createNextPayPeriod() {
  const admin = await requireOwner();

  const latest = await prisma.payPeriod.findFirst({ orderBy: { endDate: "desc" } });
  const { start, end, canCreate } = nextPeriodToCreate(latest?.endDate ?? null);
  // A week can only be added once it has begun, so repeated clicks can't pile up future periods.
  if (!canCreate) {
    throw new Error(`The next pay period (${start} to ${end}) can be created from ${start}.`);
  }
  const existing = await prisma.payPeriod.findFirst({
    where: { startDate: new Date(`${start}T00:00:00.000Z`) },
    select: { id: true },
  });
  if (existing) {
    throw new Error("That pay period already exists.");
  }

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

const dayTypeSchema = z.object({
  payPeriodId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // AUTO clears the recorded value so the weekday rotation applies again.
  operationDay: z.enum(["AUTO", "COOKING", "JAR_FILLING"]),
});

/** Corrects which operation day (Cooking / Jar Filling) a date in an open pay
 * period counts as, which sets the pay rate for Production employees. */
export async function setPeriodDayType(formData: FormData) {
  const admin = await requireOwner();
  const parsed = dayTypeSchema.parse({
    payPeriodId: formData.get("payPeriodId"),
    date: formData.get("date"),
    operationDay: formData.get("operationDay"),
  });

  const period = await prisma.payPeriod.findUniqueOrThrow({ where: { id: parsed.payPeriodId } });
  if (period.status === "FINALIZED") {
    throw new Error("This pay period is finalized.");
  }
  const date = new Date(`${parsed.date}T00:00:00.000Z`);
  if (date < period.startDate || date > period.endDate) {
    throw new Error("That date is outside this pay period.");
  }

  const before = await prisma.operationDayLog.findUnique({ where: { date } });
  if (parsed.operationDay === "AUTO") {
    await prisma.operationDayLog.deleteMany({ where: { date } });
  } else {
    await setOperationDayForDate(date, parsed.operationDay);
  }

  await logAudit({
    actorAdminId: admin.id,
    action: "SET_OPERATION_DAY",
    targetTable: "OperationDayLog",
    targetId: parsed.date,
    before: before ? { operationDay: before.operationDay } : undefined,
    after: { operationDay: parsed.operationDay },
  });

  revalidatePath(`/admin/payroll/${parsed.payPeriodId}`);
}

/** Guards the "skip suggestion" actions: the date must fall in the pay period,
 * and neither the period nor this employee's payslip may be finalized. */
async function assertSuggestionEditable(payPeriodId: string, employeeId: string, dateKey: string) {
  const period = await prisma.payPeriod.findUniqueOrThrow({ where: { id: payPeriodId } });
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (date < period.startDate || date > period.endDate) {
    throw new Error("That date is outside this pay period.");
  }
  const finalizedPayslip = await prisma.payslip.findFirst({
    where: { employeeId, payPeriodId, status: "FINALIZED" },
    select: { id: true },
  });
  if (period.status === "FINALIZED" || finalizedPayslip) {
    throw new Error("This payslip is finalized. Unlock it first to make changes.");
  }
}

const DEDUCTION_LABELS =["Cash Advance", "Negligence", "Late", "Half day"];

const adjustmentSchema = z.object({
  payslipId: z.string().min(1),
  label: z.enum(["Cash Advance", "Negligence", "Late", "Half day", "Bonus"]),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than zero")
    .max(100000, "Amount must be ₱100,000 or less")
    .transform((n) => Math.round(n * 100) / 100),
  note: z.string().trim().optional(),
});

export async function addAdjustment(formData: FormData) {
  const admin = await requireOwner();
  const parsed = adjustmentSchema.parse({
    payslipId: formData.get("payslipId"),
    label: formData.get("label"),
    amount: numberText(formData.get("amount")),
    note: formData.get("note") || undefined,
  });

  const payslip = await prisma.payslip.findUniqueOrThrow({ where: { id: parsed.payslipId } });
  if (payslip.status === "FINALIZED") {
    throw new Error("This payslip is finalized. Unlock it first to make changes.");
  }

  // Cash Advance, Negligence, Late, and Half day are always deductions; Bonus is
  // always an incentive -- the admin enters a plain positive amount and the
  // sign is applied automatically based on the chosen label.
  const signedAmount = DEDUCTION_LABELS.includes(parsed.label) ? -parsed.amount : parsed.amount;

  const adjustment = await prisma.payslipAdjustment.create({
    data: {
      payslipId: parsed.payslipId,
      label: parsed.label,
      amount: signedAmount,
      note: parsed.note,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_ADJUSTMENT",
    targetTable: "PayslipAdjustment",
    targetId: adjustment.id,
    after: { label: parsed.label, amount: signedAmount, note: parsed.note },
  });

  revalidatePath(`/admin/payroll/${payslip.payPeriodId}`);
}

export async function removeAdjustment(formData: FormData) {
  const admin = await requireOwner();
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
  const admin = await requireOwner();
  const payPeriodId = String(formData.get("payPeriodId"));

  const acknowledged = formData.get("acknowledgeIssues") === "on";

  const period = await prisma.payPeriod.findUniqueOrThrow({ where: { id: payPeriodId } });
  if (period.status === "FINALIZED") return;

  // Finalizing freezes pay and locks attendance, so the whole week has to be
  // over first -- otherwise the rest of the week's punches would be rejected.
  const endDate = period.endDate.toISOString().slice(0, 10);
  if (localDateKey(new Date()) <= endDate) {
    throw new Error(`This pay period runs until ${endDate}. It can be finalized from the next day.`);
  }

  const [employees, settings, dayOverrides] = await Promise.all([
    // Also anyone deactivated mid-period who already has a payslip here, so
    // theirs is locked with the rest instead of staying a draft.
    prisma.employee.findMany({
      where: { OR: [{ active: true }, { payslips: { some: { payPeriodId } } }] },
    }),
    getSettings(),
    getOperationDayOverrides(period.startDate, period.endDate),
  ]);

  const rows = await Promise.all(
    employees.map(async (emp) => ({
      employee: emp,
      payslip: await getOrRefreshDraftPayslip(emp.id, payPeriodId),
      review: await getEmployeePeriodReview(emp, period, settings, dayOverrides),
    }))
  );

  // Same checklist the payroll page shows. Finalizing with open items needs
  // an explicit "finalize anyway" so nothing slips through by accident.
  const issues = finalizeIssues(rows);
  if (hasFinalizeIssues(issues) && !acknowledged) {
    throw new Error("Some payslips still need attention. Review the checklist, or tick “Finalize anyway”.");
  }

  const draftIds = rows.filter((r) => r.payslip.status !== "FINALIZED").map((r) => r.payslip.id);
  await prisma.$transaction([
    prisma.payslip.updateMany({ where: { id: { in: draftIds } }, data: { status: "FINALIZED" } }),
    prisma.payPeriod.update({
      where: { id: payPeriodId },
      data: { status: "FINALIZED", finalizedAt: new Date(), finalizedByAdminId: admin.id },
    }),
  ]);

  await logAudit({
    actorAdminId: admin.id,
    action: "FINALIZE_PAY_PERIOD",
    targetTable: "PayPeriod",
    targetId: payPeriodId,
    after: hasFinalizeIssues(issues) ? { finalizedWithOpenIssues: issues } : undefined,
  });

  revalidatePath(`/admin/payroll/${payPeriodId}`);
  revalidatePath("/admin/payroll");
}

const unlockSchema = z.object({
  payslipId: z.string().min(1),
  reason: z.string().trim().min(3, "A reason is required (min 3 characters)"),
});

export async function unlockPayslip(formData: FormData) {
  const admin = await requireOwner();
  const parsed = unlockSchema.parse({
    payslipId: formData.get("payslipId"),
    reason: formData.get("reason"),
  });

  const payslip = await prisma.payslip.findUniqueOrThrow({ where: { id: parsed.payslipId } });
  if (payslip.status !== "FINALIZED") {
    throw new Error("This payslip isn't finalized, so there is nothing to unlock.");
  }

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

const addSanitationBonusSchema = z.object({
  payslipId: z.string().min(1),
  sanitationAssignmentId: z.string().min(1),
  // Defaults to the procedure's bonus; the admin can change it per approval.
  amount: z.coerce.number().positive("Amount must be more than 0").max(100000),
});

export async function addSanitationBonusToPayslip(formData: FormData) {
  const admin = await requireOwner();
  const parsed = addSanitationBonusSchema.parse({
    payslipId: formData.get("payslipId"),
    sanitationAssignmentId: formData.get("sanitationAssignmentId"),
    amount: numberText(formData.get("amount")),
  });

  const payslip = await prisma.payslip.findUniqueOrThrow({ where: { id: parsed.payslipId } });
  if (payslip.status === "FINALIZED") {
    throw new Error("This payslip is finalized. Unlock it first to make changes.");
  }

  const assignment = await prisma.sanitationAssignment.findUniqueOrThrow({
    where: { id: parsed.sanitationAssignmentId },
    include: { procedure: true },
  });
  if (assignment.payslipAdjustmentId) {
    throw new Error("This cleaning bonus has already been added to a payslip.");
  }
  if (
    assignment.status !== "DONE" ||
    assignment.inspectionResult !== "PASS" ||
    !assignment.procedure.bonusAmount
  ) {
    throw new Error("This duty has no passed-inspection bonus to add.");
  }
  if (assignment.employeeId !== payslip.employeeId) {
    throw new Error("This duty was done by a different employee.");
  }

  const adjustment = await prisma.payslipAdjustment.create({
    data: {
      payslipId: parsed.payslipId,
      label: assignment.procedure.name,
      amount: parsed.amount,
      note: `Cleaning bonus — ${assignment.date.toISOString().slice(0, 10)}`,
    },
  });

  await prisma.sanitationAssignment.update({
    where: { id: assignment.id },
    data: { payslipAdjustmentId: adjustment.id },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_SANITATION_BONUS_TO_PAYSLIP",
    targetTable: "PayslipAdjustment",
    targetId: adjustment.id,
    after: {
      label: assignment.procedure.name,
      amount: parsed.amount,
      sanitationAssignmentId: assignment.id,
    },
  });

  revalidatePath(`/admin/payroll/${payslip.payPeriodId}`);
}

const dismissBonusSchema = z.object({
  kind: z.enum(["TASK", "SANITATION"]),
  assignmentId: z.string().min(1),
  payPeriodId: z.string().min(1),
});

/** Declines a suggested bonus so it stops showing on payroll. Nothing is
 * added to any payslip; the completed duty/task itself is left untouched. */
export async function dismissBonusSuggestion(formData: FormData) {
  const admin = await requireOwner();
  const parsed = dismissBonusSchema.parse({
    kind: formData.get("kind"),
    assignmentId: formData.get("assignmentId"),
    payPeriodId: formData.get("payPeriodId"),
  });

  if (parsed.kind === "TASK") {
    const assignment = await prisma.taskAssignment.findUniqueOrThrow({
      where: { id: parsed.assignmentId },
    });
    if (assignment.payslipAdjustmentId) {
      throw new Error("This bonus has already been added to a payslip.");
    }
    await prisma.taskAssignment.update({
      where: { id: assignment.id },
      data: { bonusDismissed: true },
    });
  } else {
    const assignment = await prisma.sanitationAssignment.findUniqueOrThrow({
      where: { id: parsed.assignmentId },
    });
    if (assignment.payslipAdjustmentId) {
      throw new Error("This bonus has already been added to a payslip.");
    }
    await prisma.sanitationAssignment.update({
      where: { id: assignment.id },
      data: { bonusDismissed: true },
    });
  }

  await logAudit({
    actorAdminId: admin.id,
    action: "DISMISS_BONUS_SUGGESTION",
    targetTable: parsed.kind === "TASK" ? "TaskAssignment" : "SanitationAssignment",
    targetId: parsed.assignmentId,
  });

  revalidatePath(`/admin/payroll/${parsed.payPeriodId}`);
}

const lateDeductionSchema = z.object({
  payslipId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Prefilled with the tier amount; the admin can change it per approval.
  amount: z.coerce.number().positive("Amount must be more than 0").max(100000),
});

export async function addLateDeductionToPayslip(formData: FormData) {
  const admin = await requireOwner();
  const parsed = lateDeductionSchema.parse({
    payslipId: formData.get("payslipId"),
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
  });

  const payslip = await prisma.payslip.findUniqueOrThrow({
    where: { id: parsed.payslipId },
    include: { payPeriod: true },
  });
  if (payslip.status === "FINALIZED") {
    throw new Error("This payslip is finalized. Unlock it first to make changes.");
  }

  const dateValue = new Date(`${parsed.date}T00:00:00.000Z`);
  const existing = await prisma.lateDayAction.findUnique({
    where: { employeeId_date: { employeeId: payslip.employeeId, date: dateValue } },
  });
  if (existing?.payslipAdjustmentId) {
    throw new Error("This late deduction has already been added to a payslip.");
  }

  // Re-derive lateness server-side rather than trusting the submitted date.
  const days = await getPeriodDailyResults(payslip.employeeId, payslip.payPeriod, await getSettings());
  const day = days.find((d) => d.date === parsed.date);
  if (!day || !day.isLate) {
    throw new Error("That day isn't marked late in this pay period.");
  }

  const adjustment = await prisma.payslipAdjustment.create({
    data: {
      payslipId: parsed.payslipId,
      label: "Late",
      amount: -parsed.amount,
      note: `Late ${day.lateMinutes} min — ${parsed.date}`,
    },
  });

  await prisma.lateDayAction.upsert({
    where: { employeeId_date: { employeeId: payslip.employeeId, date: dateValue } },
    update: { dismissed: false, payslipAdjustmentId: adjustment.id },
    create: {
      employeeId: payslip.employeeId,
      date: dateValue,
      payslipAdjustmentId: adjustment.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_LATE_DEDUCTION_TO_PAYSLIP",
    targetTable: "PayslipAdjustment",
    targetId: adjustment.id,
    after: { date: parsed.date, lateMinutes: day.lateMinutes, amount: -parsed.amount },
  });

  revalidatePath(`/admin/payroll/${payslip.payPeriodId}`);
}

const dismissLateSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payPeriodId: z.string().min(1),
});

/** Declines a suggested late deduction for one day. Nothing is added to any
 * payslip; the late flag itself still shows in the employee's attendance. */
export async function dismissLateSuggestion(formData: FormData) {
  const admin = await requireOwner();
  const parsed = dismissLateSchema.parse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    payPeriodId: formData.get("payPeriodId"),
  });
  await assertSuggestionEditable(parsed.payPeriodId, parsed.employeeId, parsed.date);

  const dateValue = new Date(`${parsed.date}T00:00:00.000Z`);
  const existing = await prisma.lateDayAction.findUnique({
    where: { employeeId_date: { employeeId: parsed.employeeId, date: dateValue } },
  });
  if (existing?.payslipAdjustmentId) {
    throw new Error("This late deduction has already been added to a payslip.");
  }

  await prisma.lateDayAction.upsert({
    where: { employeeId_date: { employeeId: parsed.employeeId, date: dateValue } },
    update: { dismissed: true },
    create: { employeeId: parsed.employeeId, date: dateValue, dismissed: true },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "DISMISS_LATE_SUGGESTION",
    targetTable: "LateDayAction",
    targetId: `${parsed.employeeId}:${parsed.date}`,
  });

  revalidatePath(`/admin/payroll/${parsed.payPeriodId}`);
}

const halfDayDeductionSchema = z.object({
  payslipId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // No default: the admin decides the amount to deduct for each half day.
  amount: z.coerce.number().positive("Amount must be more than 0").max(100000),
});

export async function addHalfDayDeductionToPayslip(formData: FormData) {
  const admin = await requireOwner();
  const parsed = halfDayDeductionSchema.parse({
    payslipId: formData.get("payslipId"),
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
  });

  const payslip = await prisma.payslip.findUniqueOrThrow({
    where: { id: parsed.payslipId },
    include: { payPeriod: true, employee: true },
  });
  if (payslip.status === "FINALIZED") {
    throw new Error("This payslip is finalized. Unlock it first to make changes.");
  }
  if (payslip.employee.payBasis !== "OPERATION_DAY") {
    throw new Error("Half-day deductions are only suggested for Production employees.");
  }

  const dateValue = new Date(`${parsed.date}T00:00:00.000Z`);
  const existing = await prisma.halfDayAction.findUnique({
    where: { employeeId_date: { employeeId: payslip.employeeId, date: dateValue } },
  });
  if (existing?.payslipAdjustmentId) {
    throw new Error("This half-day deduction has already been added to a payslip.");
  }

  // Re-derive the early-out day server-side rather than trusting the submitted date.
  const days = await getPeriodDailyResults(payslip.employeeId, payslip.payPeriod, await getSettings());
  const day = days.find((d) => d.date === parsed.date);
  if (!day || !isEarlyOutDay(day)) {
    throw new Error("That day isn't flagged as left early in this pay period.");
  }

  const adjustment = await prisma.payslipAdjustment.create({
    data: {
      payslipId: parsed.payslipId,
      label: "Half day",
      amount: -parsed.amount,
      note: `Half day — ${parsed.date}`,
    },
  });

  await prisma.halfDayAction.upsert({
    where: { employeeId_date: { employeeId: payslip.employeeId, date: dateValue } },
    update: { dismissed: false, payslipAdjustmentId: adjustment.id },
    create: {
      employeeId: payslip.employeeId,
      date: dateValue,
      payslipAdjustmentId: adjustment.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_HALF_DAY_DEDUCTION_TO_PAYSLIP",
    targetTable: "PayslipAdjustment",
    targetId: adjustment.id,
    after: { date: parsed.date, amount: -parsed.amount },
  });

  revalidatePath(`/admin/payroll/${payslip.payPeriodId}`);
}

const dismissHalfDaySchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payPeriodId: z.string().min(1),
});

/** Declines a suggested half-day deduction for one day (it was a full day, or
 * not worth deducting). Nothing is added to any payslip. */
export async function dismissHalfDaySuggestion(formData: FormData) {
  const admin = await requireOwner();
  const parsed = dismissHalfDaySchema.parse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    payPeriodId: formData.get("payPeriodId"),
  });
  await assertSuggestionEditable(parsed.payPeriodId, parsed.employeeId, parsed.date);

  const dateValue = new Date(`${parsed.date}T00:00:00.000Z`);
  const existing = await prisma.halfDayAction.findUnique({
    where: { employeeId_date: { employeeId: parsed.employeeId, date: dateValue } },
  });
  if (existing?.payslipAdjustmentId) {
    throw new Error("This half-day deduction has already been added to a payslip.");
  }

  await prisma.halfDayAction.upsert({
    where: { employeeId_date: { employeeId: parsed.employeeId, date: dateValue } },
    update: { dismissed: true },
    create: { employeeId: parsed.employeeId, date: dateValue, dismissed: true },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "DISMISS_HALF_DAY_SUGGESTION",
    targetTable: "HalfDayAction",
    targetId: `${parsed.employeeId}:${parsed.date}`,
  });

  revalidatePath(`/admin/payroll/${parsed.payPeriodId}`);
}

// Form versions of the actions above: they report a problem back to the form
// (see ActionForm) instead of throwing, so the message actually reaches the screen.

export async function finalizePeriodForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => finalizePeriod(formData));
}

export async function setPeriodDayTypeForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => setPeriodDayType(formData));
}

export async function addSanitationBonusForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addSanitationBonusToPayslip(formData));
}

export async function addHalfDayDeductionForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addHalfDayDeductionToPayslip(formData));
}

export async function addLateDeductionForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addLateDeductionToPayslip(formData));
}

export async function addAdjustmentForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addAdjustment(formData));
}

export async function unlockPayslipForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => unlockPayslip(formData));
}

export async function removeAdjustmentForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => removeAdjustment(formData));
}

export async function dismissBonusSuggestionForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => dismissBonusSuggestion(formData));
}

export async function dismissLateSuggestionForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => dismissLateSuggestion(formData));
}

export async function dismissHalfDaySuggestionForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => dismissHalfDaySuggestion(formData));
}

export async function createNextPayPeriodForm(_prev: FormState, _formData: FormData): Promise<FormState> {
  void _prev;
  void _formData;
  return runForm(() => createNextPayPeriod());
}
