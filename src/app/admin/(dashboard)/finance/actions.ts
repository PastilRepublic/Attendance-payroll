"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { localDateKey } from "@/lib/payroll";
import { isRealDateKey } from "@/lib/punchRules";
import { runForm, type FormState } from "@/lib/formAction";
import { numberText } from "@/lib/numberInput";
import { EXPENSE_CATEGORIES, INCOME_CHANNELS, categoryLabel, channelLabel } from "@/lib/finance";
import { formatPeso } from "@/lib/format";

const MAX_AMOUNT = 10_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

const dateField = z
  .string()
  .refine(isRealDateKey, "Enter a valid date.")
  .refine((d) => d <= localDateKey(new Date()), "The date can't be in the future.");

const amountField = z.coerce
  .number()
  .positive("Amount must be more than ₱0.")
  .max(MAX_AMOUNT, "Amount must be ₱10,000,000 or less.")
  .transform(round2);

const noteField = z
  .string()
  .trim()
  .max(300, "Keep the note under 300 characters.")
  .optional()
  .transform((v) => v || undefined);

const codes = <T extends readonly { code: string }[]>(list: T) =>
  list.map((c) => c.code) as [T[number]["code"], ...T[number]["code"][]];

function revalidateFinance() {
  revalidatePath("/admin/finance");
}

const expenseSchema = z.object({
  date: dateField,
  amount: amountField,
  category: z.enum(codes(EXPENSE_CATEGORIES), "Choose what it was spent on."),
  paidWith: z.enum(["CASH", "BANK"], "Choose how it was paid."),
  note: noteField,
});

export async function addExpense(formData: FormData) {
  const admin = await requireOwner();
  const parsed = expenseSchema.parse({
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
    category: formData.get("category"),
    paidWith: formData.get("paidWith"),
    note: formData.get("note") || undefined,
  });

  const entry = await prisma.financeEntry.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      kind: "EXPENSE",
      amount: parsed.amount,
      category: parsed.category,
      paidWith: parsed.paidWith,
      note: parsed.note,
      createdByAdminId: admin.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_FINANCE_EXPENSE",
    targetTable: "FinanceEntry",
    targetId: entry.id,
    after: { date: parsed.date, amount: parsed.amount, category: parsed.category, paidWith: parsed.paidWith },
  });
  revalidateFinance();
  return `${categoryLabel(parsed.category)} · ${formatPeso(parsed.amount)} · ${parsed.paidWith === "CASH" ? "cash" : "bank"}`;
}

const incomeSchema = z.object({
  date: dateField,
  amount: amountField,
  channel: z.enum(codes(INCOME_CHANNELS), "Choose where the money came from."),
  note: noteField,
});

export async function addIncome(formData: FormData) {
  const admin = await requireOwner();
  const parsed = incomeSchema.parse({
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
    channel: formData.get("channel"),
    note: formData.get("note") || undefined,
  });

  const entry = await prisma.financeEntry.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      kind: "INCOME",
      amount: parsed.amount,
      category: parsed.channel,
      note: parsed.note,
      createdByAdminId: admin.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_FINANCE_INCOME",
    targetTable: "FinanceEntry",
    targetId: entry.id,
    after: { date: parsed.date, amount: parsed.amount, channel: parsed.channel },
  });
  revalidateFinance();
  return `${channelLabel(parsed.channel)} · ${formatPeso(parsed.amount)} received`;
}

const withdrawalSchema = z.object({
  date: dateField,
  amount: amountField,
  note: noteField,
});

export async function addCashWithdrawal(formData: FormData) {
  const admin = await requireOwner();
  const parsed = withdrawalSchema.parse({
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
    note: formData.get("note") || undefined,
  });

  const entry = await prisma.financeEntry.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      kind: "CASH_WITHDRAWAL",
      amount: parsed.amount,
      note: parsed.note,
      createdByAdminId: admin.id,
    },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_FINANCE_CASH_WITHDRAWAL",
    targetTable: "FinanceEntry",
    targetId: entry.id,
    after: { date: parsed.date, amount: parsed.amount },
  });
  revalidateFinance();
  return `${formatPeso(parsed.amount)} withdrawn`;
}

const openingSchema = z.object({
  date: dateField,
  bank: z.coerce.number().min(0, "The bank balance can't be negative.").max(MAX_AMOUNT).transform(round2),
  cash: z.coerce.number().min(0, "The cash can't be negative.").max(MAX_AMOUNT).transform(round2),
});

/** One-time starting point: what is in the bank and in the production cash on the day Finance begins. */
export async function setOpeningBalances(formData: FormData) {
  const admin = await requireOwner();
  const parsed = openingSchema.parse({
    date: formData.get("date"),
    bank: numberText(formData.get("bank")) || "0",
    cash: numberText(formData.get("cash")) || "0",
  });

  const existing = await prisma.financeEntry.count({
    where: { kind: { in: ["OPENING_BANK", "OPENING_CASH"] }, voided: false },
  });
  if (existing > 0) {
    throw new Error("Starting balances are already set. Void them in the records first if they were wrong.");
  }

  const date = new Date(`${parsed.date}T00:00:00.000Z`);
  await prisma.financeEntry.createMany({
    data: [
      { date, kind: "OPENING_BANK", amount: parsed.bank, note: "Starting balance", createdByAdminId: admin.id },
      { date, kind: "OPENING_CASH", amount: parsed.cash, note: "Starting cash", createdByAdminId: admin.id },
    ],
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "SET_FINANCE_OPENING_BALANCES",
    targetTable: "FinanceEntry",
    targetId: parsed.date,
    after: { bank: parsed.bank, cash: parsed.cash },
  });
  revalidateFinance();
}

const voidSchema = z.object({
  entryId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)."),
});

/** A wrong line is voided, never deleted: it stays in the records with who voided it and why. */
export async function voidFinanceEntry(formData: FormData) {
  const admin = await requireOwner();
  const parsed = voidSchema.parse({
    entryId: formData.get("entryId"),
    reason: formData.get("reason"),
  });

  const entry = await prisma.financeEntry.findUnique({ where: { id: parsed.entryId } });
  if (!entry) throw new Error("That entry no longer exists.");
  if (entry.voided) throw new Error("That entry is already voided.");

  await prisma.financeEntry.update({
    where: { id: entry.id },
    data: { voided: true, voidedAt: new Date(), voidedByAdminId: admin.id, voidReason: parsed.reason },
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "VOID_FINANCE_ENTRY",
    targetTable: "FinanceEntry",
    targetId: entry.id,
    before: { kind: entry.kind, amount: Number(entry.amount), category: entry.category },
    reason: parsed.reason,
  });
  revalidateFinance();
}

// Form versions of the actions above (see ActionForm): they return the problem to the form.
export async function addExpenseForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addExpense(formData));
}

export async function addIncomeForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addIncome(formData));
}

export async function addCashWithdrawalForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addCashWithdrawal(formData));
}

export async function setOpeningBalancesForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => setOpeningBalances(formData));
}

export async function voidFinanceEntryForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => voidFinanceEntry(formData));
}
