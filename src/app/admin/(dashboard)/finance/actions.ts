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
import {
  EXPENSE_CATEGORIES,
  INCOME_CHANNELS,
  cardBalances,
  categoryLabel,
  channelLabel,
  computeBalances,
  maxPercentEach,
  nextPaydayToRecord,
  ownerBalances,
  periodProfit,
  sharePlan,
  type FinanceRow,
} from "@/lib/finance";
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
  paidWith: z.enum(["CASH", "BANK", "CARD"], "Choose how it was paid."),
  cardId: z.string().optional(),
  note: noteField,
});

export async function addExpense(formData: FormData) {
  const admin = await requireOwner();
  const parsed = expenseSchema.parse({
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
    category: formData.get("category"),
    paidWith: formData.get("paidWith"),
    cardId: formData.get("cardId") || undefined,
    note: formData.get("note") || undefined,
  });

  // A card expense needs to say which card, and it has to be one that is still in use.
  let card: { id: string; name: string } | null = null;
  if (parsed.paidWith === "CARD") {
    if (!parsed.cardId) throw new Error("Choose which credit card it was charged to.");
    card = await prisma.financeCard.findFirst({
      where: { id: parsed.cardId, active: true },
      select: { id: true, name: true },
    });
    if (!card) throw new Error("That credit card is no longer in use.");
  }

  const entry = await prisma.financeEntry.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      kind: "EXPENSE",
      amount: parsed.amount,
      category: parsed.category,
      paidWith: parsed.paidWith,
      cardId: card?.id,
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
  return `${categoryLabel(parsed.category)} · ${formatPeso(parsed.amount)} · ${
    card ? `card ${card.name}` : parsed.paidWith === "CASH" ? "cash" : "bank"
  }`;
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
  if (entry.paydayId) throw new Error("This belongs to a payday. Void the whole payday instead.");

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

const toRows = (
  entries: {
    id: string;
    date: Date;
    kind: FinanceRow["kind"];
    amount: unknown;
    category: string | null;
    paidWith: FinanceRow["paidWith"];
    cardId: string | null;
    ownerId: string | null;
    voided: boolean;
    createdAt: Date;
  }[]
): FinanceRow[] =>
  entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    kind: e.kind,
    amount: Number(e.amount),
    category: e.category,
    paidWith: e.paidWith,
    cardId: e.cardId,
    ownerId: e.ownerId,
    voided: e.voided,
    createdAt: e.createdAt.getTime(),
  }));

/** What is owed on one card, worked out from its lines in the ledger. */
async function amountOwed(cardId: string): Promise<number> {
  const entries = await prisma.financeEntry.findMany({ where: { cardId, voided: false } });
  const rows = toRows(entries);
  return cardBalances(rows, [cardId])[0].owed;
}

const dayOfMonth = (label: string) =>
  z.coerce
    .number()
    .int(`The ${label} must be a whole number.`)
    .min(1, `The ${label} is 1 to 31.`)
    .max(31, `The ${label} is 1 to 31.`);

const addCardSchema = z
  .object({
    name: z.string().trim().min(1, "Give the card a name, like Metrobank.").max(40, "Keep the name under 40 characters."),
    statementDay: dayOfMonth("statement day"),
    dueDay: dayOfMonth("due day"),
  })
  .refine((v) => v.statementDay !== v.dueDay, {
    message: "The due day can't be the same as the statement day.",
    path: ["dueDay"],
  });

export async function addCard(formData: FormData) {
  const admin = await requireOwner();
  const parsed = addCardSchema.parse({
    name: formData.get("name"),
    statementDay: formData.get("statementDay"),
    dueDay: formData.get("dueDay"),
  });

  const duplicate = await prisma.financeCard.findFirst({
    where: { active: true, name: { equals: parsed.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error("You already have a card with that name.");

  const card = await prisma.financeCard.create({
    data: { name: parsed.name, statementDay: parsed.statementDay, dueDay: parsed.dueDay },
  });
  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_FINANCE_CARD",
    targetTable: "FinanceCard",
    targetId: card.id,
    after: { name: card.name, statementDay: card.statementDay, dueDay: card.dueDay },
  });
  revalidateFinance();
  return `${card.name} added: statement on the ${card.statementDay}th, due on the ${card.dueDay}th`;
}

const statementDaySchema = z.object({
  cardId: z.string().min(1),
  statementDay: dayOfMonth("statement day"),
});

/** Sets (or changes) the day of the month a card's statement is printed. */
export async function setCardStatementDay(formData: FormData) {
  const admin = await requireOwner();
  const parsed = statementDaySchema.parse({
    cardId: formData.get("cardId"),
    statementDay: formData.get("statementDay"),
  });

  const card = await prisma.financeCard.findUnique({ where: { id: parsed.cardId } });
  if (!card) throw new Error("That card no longer exists.");
  if (card.dueDay === parsed.statementDay) throw new Error("The statement day can't be the same as the due day.");

  await prisma.financeCard.update({ where: { id: card.id }, data: { statementDay: parsed.statementDay } });
  await logAudit({
    actorAdminId: admin.id,
    action: "SET_FINANCE_CARD_STATEMENT_DAY",
    targetTable: "FinanceCard",
    targetId: card.id,
    before: { statementDay: card.statementDay },
    after: { statementDay: parsed.statementDay },
  });
  revalidateFinance();
  return `${card.name}: statement on the ${parsed.statementDay}th`;
}

/** A card with something still owed can't be removed from the list. */
export async function setCardActive(formData: FormData) {
  const admin = await requireOwner();
  const cardId = z.string().min(1).parse(formData.get("cardId"));
  const active = formData.get("active") === "true";

  const card = await prisma.financeCard.findUnique({ where: { id: cardId } });
  if (!card) throw new Error("That card no longer exists.");
  if (!active) {
    const owed = await amountOwed(cardId);
    if (owed !== 0) {
      throw new Error(`${card.name} still has ${formatPeso(owed)} owed. Pay it off before removing the card.`);
    }
  }

  await prisma.financeCard.update({ where: { id: cardId }, data: { active } });
  await logAudit({
    actorAdminId: admin.id,
    action: active ? "REACTIVATE_FINANCE_CARD" : "DEACTIVATE_FINANCE_CARD",
    targetTable: "FinanceCard",
    targetId: cardId,
  });
  revalidateFinance();
}

const payCardSchema = z.object({
  cardId: z.string().min(1, "Choose a card."),
  date: dateField,
  amount: amountField,
  note: noteField,
});

/** Paying a card bill takes money out of the bank and lowers what the card owes. */
export async function payCard(formData: FormData) {
  const admin = await requireOwner();
  const parsed = payCardSchema.parse({
    cardId: formData.get("cardId"),
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
    note: formData.get("note") || undefined,
  });

  const card = await prisma.financeCard.findUnique({ where: { id: parsed.cardId } });
  if (!card) throw new Error("That card no longer exists.");
  const owed = await amountOwed(card.id);
  if (parsed.amount > owed + 0.005) {
    throw new Error(`${card.name} only has ${formatPeso(owed)} owed, so that payment is too much.`);
  }

  const entry = await prisma.financeEntry.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      kind: "CARD_PAYMENT",
      amount: parsed.amount,
      cardId: card.id,
      note: parsed.note,
      createdByAdminId: admin.id,
    },
  });
  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_FINANCE_CARD_PAYMENT",
    targetTable: "FinanceEntry",
    targetId: entry.id,
    after: { date: parsed.date, amount: parsed.amount, card: card.name },
  });
  revalidateFinance();
  return `${card.name} · ${formatPeso(parsed.amount)} paid`;
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

export async function addCardForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addCard(formData));
}

export async function setCardActiveForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => setCardActive(formData));
}

export async function payCardForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => payCard(formData));
}

export async function setCardStatementDayForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => setCardStatementDay(formData));
}

// ---- Owners: extra draws and the 15th / 30th payday ----

async function activeOwners() {
  return prisma.adminUser.findMany({
    where: { role: "OWNER", active: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

async function allRows() {
  return toRows(await prisma.financeEntry.findMany({ where: { voided: false } }));
}

const drawSchema = z.object({
  date: dateField,
  amount: amountField,
  ownerId: z.string().min(1, "Choose who took the money."),
  note: noteField,
});

/** Money an owner takes between paydays. It comes out of the bank and off their next payday share. */
export async function addOwnerDraw(formData: FormData) {
  const admin = await requireOwner();
  const parsed = drawSchema.parse({
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
    ownerId: formData.get("ownerId"),
    note: formData.get("note") || undefined,
  });

  const owner = (await activeOwners()).find((o) => o.id === parsed.ownerId);
  if (!owner) throw new Error("Choose one of the owners.");

  const rows = await allRows();
  const bank = computeBalances(rows).bank;
  if (parsed.amount > bank + 0.005) {
    throw new Error(`The bank only has ${formatPeso(bank)}. Record the money received first, then try again.`);
  }

  const entry = await prisma.financeEntry.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      kind: "OWNER_DRAW",
      amount: parsed.amount,
      category: "EXTRA",
      paidWith: "BANK",
      ownerId: owner.id,
      note: parsed.note,
      createdByAdminId: admin.id,
    },
  });
  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_FINANCE_OWNER_DRAW",
    targetTable: "FinanceEntry",
    targetId: entry.id,
    after: { date: parsed.date, amount: parsed.amount, owner: owner.name },
  });
  revalidateFinance();
  return `${owner.name} took ${formatPeso(parsed.amount)}. It comes off the next payday share.`;
}

const paydaySchema = z.object({
  paydayDate: z.string().refine(isRealDateKey, "Reload the page and try again."),
  percent: z.coerce
    .number()
    .positive("Enter the percentage each owner takes.")
    .transform((n) => Math.round(n * 100) / 100),
});

/**
 * The 15th/30th payday. Each owner gets the same percentage of the profit since the last
 * payday; what they already took comes off, and the rest is paid from the bank. The profit is
 * worked out here from the ledger, never taken from the form.
 */
export async function recordPayday(formData: FormData) {
  const admin = await requireOwner();
  const parsed = paydaySchema.parse({
    paydayDate: formData.get("paydayDate"),
    percent: numberText(formData.get("percent")),
  });

  const owners = await activeOwners();
  if (owners.length < 2) {
    throw new Error("Add your co-owner's login in Settings first, so the share can be split between you both.");
  }
  const maxEach = maxPercentEach(owners.length);
  if (parsed.percent > maxEach) {
    throw new Error(`With ${owners.length} owners, each can take at most ${maxEach}%.`);
  }

  const last = await prisma.financePayday.findFirst({ where: { voided: false }, orderBy: { date: "desc" } });
  const lastKey = last ? last.date.toISOString().slice(0, 10) : null;
  const due = nextPaydayToRecord(lastKey, localDateKey(new Date()));
  if (!due) throw new Error("There is no payday to record yet.");
  if (due !== parsed.paydayDate) throw new Error("The page was out of date. Reload it and try again.");

  const rows = await allRows();
  const period = periodProfit(rows, lastKey, due);
  if (period.profit <= 0) {
    throw new Error(
      "There was no profit in this period, so there is nothing to share. Record any missing money received first."
    );
  }

  const balances = ownerBalances(rows, owners.map((o) => o.id));
  const plan = sharePlan(
    period.profit,
    parsed.percent,
    owners.map((o) => ({ id: o.id, before: balances.get(o.id) ?? 0 }))
  );
  const totalPayout = Math.round(plan.reduce((sum, p) => sum + p.payout, 0) * 100) / 100;
  const bank = computeBalances(rows).bank;
  if (totalPayout > bank + 0.005) {
    throw new Error(
      `The payday needs ${formatPeso(totalPayout)} but the bank only has ${formatPeso(bank)}. Record any missing money received first.`
    );
  }

  const date = new Date(`${due}T00:00:00.000Z`);
  const payday = await prisma.$transaction(async (tx) => {
    const created = await tx.financePayday.create({
      data: {
        date,
        periodStart: new Date(`${period.start}T00:00:00.000Z`),
        periodEnd: date,
        profit: period.profit,
        percent: parsed.percent,
        createdByAdminId: admin.id,
      },
    });
    const lines = plan.flatMap((p) => [
      ...(p.share > 0
        ? [
            {
              date,
              kind: "OWNER_SHARE" as const,
              amount: p.share,
              category: "PAYDAY",
              ownerId: p.ownerId,
              paydayId: created.id,
              createdByAdminId: admin.id,
            },
          ]
        : []),
      ...(p.payout > 0
        ? [
            {
              date,
              kind: "OWNER_DRAW" as const,
              amount: p.payout,
              category: "PAYDAY",
              paidWith: "BANK" as const,
              ownerId: p.ownerId,
              paydayId: created.id,
              createdByAdminId: admin.id,
            },
          ]
        : []),
    ]);
    await tx.financeEntry.createMany({ data: lines });
    return created;
  });

  await logAudit({
    actorAdminId: admin.id,
    action: "RECORD_FINANCE_PAYDAY",
    targetTable: "FinancePayday",
    targetId: payday.id,
    after: { date: due, profit: period.profit, percent: parsed.percent, payouts: plan.map((p) => p.payout) },
  });
  revalidateFinance();
  return `Payday recorded: ${formatPeso(totalPayout)} paid out from the bank.`;
}

const voidPaydaySchema = z.object({
  paydayId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)."),
});

/** Voids a payday and everything it created. Only the latest payday, so the periods stay in order. */
export async function voidPayday(formData: FormData) {
  const admin = await requireOwner();
  const parsed = voidPaydaySchema.parse({
    paydayId: formData.get("paydayId"),
    reason: formData.get("reason"),
  });

  const payday = await prisma.financePayday.findUnique({ where: { id: parsed.paydayId } });
  if (!payday) throw new Error("That payday no longer exists.");
  if (payday.voided) throw new Error("That payday is already voided.");
  const latest = await prisma.financePayday.findFirst({ where: { voided: false }, orderBy: { date: "desc" } });
  if (latest?.id !== payday.id) throw new Error("Only the latest payday can be voided.");

  const now = new Date();
  await prisma.$transaction([
    prisma.financePayday.update({
      where: { id: payday.id },
      data: { voided: true, voidedAt: now, voidReason: parsed.reason },
    }),
    prisma.financeEntry.updateMany({
      where: { paydayId: payday.id, voided: false },
      data: { voided: true, voidedAt: now, voidedByAdminId: admin.id, voidReason: parsed.reason },
    }),
  ]);
  await logAudit({
    actorAdminId: admin.id,
    action: "VOID_FINANCE_PAYDAY",
    targetTable: "FinancePayday",
    targetId: payday.id,
    before: { date: payday.date.toISOString().slice(0, 10), profit: Number(payday.profit), percent: Number(payday.percent) },
    reason: parsed.reason,
  });
  revalidateFinance();
}

export async function addOwnerDrawForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addOwnerDraw(formData));
}

export async function recordPaydayForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => recordPayday(formData));
}

export async function voidPaydayForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => voidPayday(formData));
}

// ---- Monthly bills: rent, internet, electricity... saved once, recorded each month ----

const billSchema = z
  .object({
    name: z.string().trim().min(1, "Give the bill a name, like Rent.").max(40, "Keep the name under 40 characters."),
    category: z.enum(codes(EXPENSE_CATEGORIES), "Choose what kind of bill it is."),
    amount: amountField,
    dueDay: dayOfMonth("due day"),
    paidWith: z.enum(["CASH", "BANK", "CARD"], "Choose how it is paid."),
    cardId: z.string().optional(),
  })
  .refine((v) => v.paidWith !== "CARD" || !!v.cardId, {
    message: "Choose which credit card it is charged to.",
    path: ["cardId"],
  });

async function activeCardOrThrow(cardId: string) {
  const card = await prisma.financeCard.findFirst({ where: { id: cardId, active: true }, select: { id: true, name: true } });
  if (!card) throw new Error("That credit card is no longer in use.");
  return card;
}

/** Saves a bill that comes every month, so it only has to be recorded with one tap. */
export async function addBill(formData: FormData) {
  const admin = await requireOwner();
  const parsed = billSchema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    amount: numberText(formData.get("amount")),
    dueDay: formData.get("dueDay"),
    paidWith: formData.get("paidWith"),
    cardId: formData.get("cardId") || undefined,
  });

  const duplicate = await prisma.financeBill.findFirst({
    where: { active: true, name: { equals: parsed.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error("You already have a monthly bill with that name.");
  const card = parsed.paidWith === "CARD" ? await activeCardOrThrow(parsed.cardId!) : null;

  const bill = await prisma.financeBill.create({
    data: {
      name: parsed.name,
      category: parsed.category,
      amount: parsed.amount,
      dueDay: parsed.dueDay,
      paidWith: parsed.paidWith,
      cardId: card?.id,
    },
  });
  await logAudit({
    actorAdminId: admin.id,
    action: "ADD_FINANCE_BILL",
    targetTable: "FinanceBill",
    targetId: bill.id,
    after: { name: bill.name, category: bill.category, amount: parsed.amount, dueDay: bill.dueDay, paidWith: bill.paidWith },
  });
  revalidateFinance();
  return `${bill.name} added: ${formatPeso(parsed.amount)} on the ${bill.dueDay}th of every month`;
}

const updateBillSchema = z.object({
  billId: z.string().min(1),
  amount: amountField,
  dueDay: dayOfMonth("due day"),
});

/** Changes a bill's usual amount and due day (past records are not touched). */
export async function updateBill(formData: FormData) {
  const admin = await requireOwner();
  const parsed = updateBillSchema.parse({
    billId: formData.get("billId"),
    amount: numberText(formData.get("amount")),
    dueDay: formData.get("dueDay"),
  });
  const bill = await prisma.financeBill.findUnique({ where: { id: parsed.billId } });
  if (!bill) throw new Error("That bill no longer exists.");

  await prisma.financeBill.update({ where: { id: bill.id }, data: { amount: parsed.amount, dueDay: parsed.dueDay } });
  await logAudit({
    actorAdminId: admin.id,
    action: "UPDATE_FINANCE_BILL",
    targetTable: "FinanceBill",
    targetId: bill.id,
    before: { amount: Number(bill.amount), dueDay: bill.dueDay },
    after: { amount: parsed.amount, dueDay: parsed.dueDay },
  });
  revalidateFinance();
}

/** Stops a monthly bill (it stays in the records it already made). */
export async function setBillActive(formData: FormData) {
  const admin = await requireOwner();
  const billId = z.string().min(1).parse(formData.get("billId"));
  const active = formData.get("active") === "true";
  const bill = await prisma.financeBill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error("That bill no longer exists.");

  await prisma.financeBill.update({ where: { id: billId }, data: { active } });
  await logAudit({
    actorAdminId: admin.id,
    action: active ? "REACTIVATE_FINANCE_BILL" : "DEACTIVATE_FINANCE_BILL",
    targetTable: "FinanceBill",
    targetId: billId,
  });
  revalidateFinance();
}

const recordBillSchema = z.object({
  billId: z.string().min(1),
  date: dateField,
  amount: amountField,
  note: noteField,
});

/** Records one month's bill as an ordinary expense. Once per bill per month. */
export async function recordBill(formData: FormData) {
  const admin = await requireOwner();
  const parsed = recordBillSchema.parse({
    billId: formData.get("billId"),
    date: formData.get("date"),
    amount: numberText(formData.get("amount")),
    note: formData.get("note") || undefined,
  });

  const bill = await prisma.financeBill.findUnique({ where: { id: parsed.billId } });
  if (!bill || !bill.active) throw new Error("That bill is no longer in use.");
  const card = bill.paidWith === "CARD" && bill.cardId ? await activeCardOrThrow(bill.cardId) : null;
  if (bill.paidWith === "CARD" && !card) throw new Error("Choose a card for this bill first.");

  const month = parsed.date.slice(0, 7);
  const already = await prisma.financeEntry.findFirst({
    where: {
      billId: bill.id,
      voided: false,
      date: { gte: new Date(`${month}-01T00:00:00.000Z`), lt: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)) },
    },
    select: { id: true },
  });
  if (already) {
    throw new Error(`${bill.name} is already recorded for that month. Void that record first if it was wrong.`);
  }

  const entry = await prisma.financeEntry.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      kind: "EXPENSE",
      amount: parsed.amount,
      category: bill.category,
      paidWith: bill.paidWith,
      cardId: card?.id,
      billId: bill.id,
      note: parsed.note ?? `Monthly bill: ${bill.name}`,
      createdByAdminId: admin.id,
    },
  });
  await logAudit({
    actorAdminId: admin.id,
    action: "RECORD_FINANCE_BILL",
    targetTable: "FinanceEntry",
    targetId: entry.id,
    after: { bill: bill.name, date: parsed.date, amount: parsed.amount },
  });
  revalidateFinance();
  return `${bill.name} · ${formatPeso(parsed.amount)} recorded`;
}

export async function addBillForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => addBill(formData));
}

export async function updateBillForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => updateBill(formData));
}

export async function setBillActiveForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => setBillActive(formData));
}

export async function recordBillForm(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(() => recordBill(formData));
}
