import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { localDateKey } from "@/lib/payroll";
import { formatPeso } from "@/lib/format";
import { currentMonthKey, isMonthKey, monthLabel } from "@/lib/payPeriods";
import {
  EXPENSE_CATEGORIES,
  CHANNEL_STYLE,
  INCOME_CHANNELS,
  NEUTRAL_CHANNEL_STYLE,
  cardBalances,
  cardDue,
  billStatus,
  cashLog,
  categoryLabel,
  channelLabel,
  computeBalances,
  daysBetween,
  maxPercentEach,
  nextDueDate,
  firstActivityDate,
  nextPaydayToRecord,
  ownerBalances,
  periodProfit,
  summarizeMonth,
  upcomingPayday,
  type CardDue,
  type FinanceRow,
} from "@/lib/finance";
import ActionForm from "@/components/ActionForm";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import Metric from "@/components/ui/Metric";
import Banner from "@/components/ui/Banner";
import EmptyState from "@/components/ui/EmptyState";
import MonthPicker from "@/components/ui/MonthPicker";
import FormDialog from "@/components/ui/FormDialog";
import NumberInput from "@/components/ui/NumberInput";
import PillButton from "@/components/ui/PillButton";
import { inputClass, labelClass, pillClass } from "@/components/ui/styles";
import PaidWithFields from "./PaidWithFields";
import PaydayPanel from "./PaydayPanel";
import ReminderTicker, { type Reminder } from "./ReminderTicker";
import CreditCardFace from "./CreditCardFace";
import {
  addCardForm,
  addCashWithdrawalForm,
  addExpenseForm,
  addIncomeForm,
  addBillForm,
  addOwnerDrawForm,
  payCardForm,
  recordBillForm,
  setBillActiveForm,
  updateBillForm,
  recordPaydayForm,
  setCardActiveForm,
  setCardStatementDayForm,
  setOpeningBalancesForm,
  voidFinanceEntryForm,
  voidPaydayForm,
} from "./actions";

export const dynamic = "force-dynamic";

// Ledger dates are plain dates (UTC midnight), so they are formatted in UTC.
const fmtDate = (key: string, pattern = "MMM d") => formatInTimeZone(new Date(`${key}T00:00:00Z`), "UTC", pattern);

const KIND_LABEL: Record<string, string> = {
  OPENING_BANK: "Starting bank balance",
  OPENING_CASH: "Starting cash",
  INCOME: "Money received",
  EXPENSE: "Expense",
  CASH_WITHDRAWAL: "Cash withdrawal",
  CARD_PAYMENT: "Card payment",
  OWNER_SHARE: "Owner's share",
  OWNER_DRAW: "Owner draw",
};

function TodayField({ today }: { today: string }) {
  return (
    <div>
      <label className={labelClass}>Date</label>
      <input type="date" name="date" defaultValue={today} max={today} required className={inputClass} />
    </div>
  );
}

function AmountField({ label = "Amount (₱)" }: { label?: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <NumberInput
        name="amount"
        required
        placeholder="0.00"
        className={inputClass}
      />
    </div>
  );
}

function NoteField() {
  return (
    <div>
      <label className={labelClass}>Note (optional)</label>
      <input name="note" maxLength={300} placeholder="What it was for" className={inputClass} />
    </div>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const current = currentMonthKey();
  const month = params.month && isMonthKey(params.month) && params.month <= current ? params.month : current;
  const today = localDateKey(new Date());

  const entries = await prisma.financeEntry.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      createdByAdmin: { select: { name: true } },
      voidedByAdmin: { select: { name: true } },
      owner: { select: { name: true } },
    },
  });
  const bills = await prisma.financeBill.findMany({ where: { active: true }, orderBy: [{ dueDay: "asc" }, { name: "asc" }] });
  const session = await auth();
  const owners = await prisma.adminUser.findMany({
    where: { role: "OWNER", active: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const paydays = await prisma.financePayday.findMany({
    where: { voided: false },
    orderBy: { date: "desc" },
    take: 6,
    include: { entries: { where: { voided: false }, include: { owner: { select: { name: true } } } } },
  });

  const allCards = await prisma.financeCard.findMany({ orderBy: { createdAt: "asc" } });
  const cards = allCards.filter((c) => c.active);
  const cardName = new Map(allCards.map((c) => [c.id, c.name]));

  const rows: FinanceRow[] = entries.map((e) => ({
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

  const hasOpening = rows.some((r) => (r.kind === "OPENING_BANK" || r.kind === "OPENING_CASH") && !r.voided);
  const balances = computeBalances(rows);
  const summary = summarizeMonth(rows, month);
  const log = cashLog(rows).reverse().slice(0, 30);
  // A share moves no money and is shown with its payday, so the records list leaves it out.
  const monthEntries = entries.filter(
    (e) => e.kind !== "OWNER_SHARE" && e.date.toISOString().slice(0, 10).startsWith(month)
  );
  const biggestSpend = summary.byCategory[0]?.amount ?? 0;
  const cashLow = balances.cash < 0;

  // Credit cards: what is due on the latest bill, what isn't billed yet, and what is overdue.
  const cardRows = cards.map((c) => {
    let info: CardDue;
    if (c.statementDay) {
      info = cardDue(rows, c.id, c.statementDay, c.dueDay, today);
    } else {
      // A card added before statement days existed: one balance and the next due day.
      const owed = cardBalances(rows, [c.id])[0].owed;
      info = { owed, statementDate: "", dueDate: nextDueDate(c.dueDay, today), dueAmount: owed, notYetBilled: 0, overdue: null };
    }
    return { id: c.id, name: c.name, statementDay: c.statementDay, ...info, days: daysBetween(today, info.dueDate) };
  });
  const totalOwed = cardRows.reduce((sum, c) => sum + c.owed, 0);
  const overdueCards = cardRows.filter((c) => c.overdue);
  const dueSoon = cardRows.filter((c) => !c.overdue && c.dueAmount > 0 && c.days <= 7);
  const afterCards = Math.round((balances.total - totalOwed) * 100) / 100;

  // Monthly bills: which ones are already recorded this month, and which are due or late.
  const recordedBills = new Set(
    entries
      .filter((e) => e.billId && !e.voided && e.date.toISOString().slice(0, 7) === current)
      .map((e) => e.billId as string)
  );
  const billRows = bills.map((b) => ({
    ...b,
    amount: Number(b.amount),
    status: billStatus(b.dueDay, recordedBills.has(b.id), today),
    paidLabel: b.paidWith === "CASH" ? "production cash" : b.paidWith === "CARD" ? `card ${cardName.get(b.cardId ?? "") ?? ""}`.trim() : "bank",
  }));
  const billAlerts = billRows.filter((b) => b.status.state === "overdue" || b.status.state === "dueSoon");

  // Everything that needs a look, for the sliding banner at the top: late things first.
  const when = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
  const reminders: Reminder[] = [
    ...overdueCards.map((c) => ({
      key: `card-late-${c.id}`,
      tone: "overdue" as const,
      name: c.name,
      rest: `bill was due ${fmtDate(c.overdue!.since, "MMM d")}: ${formatPeso(c.overdue!.amount)} is still unpaid.`,
    })),
    ...billAlerts
      .filter((b) => b.status.state === "overdue")
      .map((b) => ({
        key: `bill-late-${b.id}`,
        tone: "overdue" as const,
        name: b.name,
        rest: `was due ${fmtDate(b.status.dueDate, "MMM d")} and is not recorded yet.`,
      })),
    ...dueSoon.map((c) => ({
      key: `card-soon-${c.id}`,
      tone: "soon" as const,
      name: c.name,
      rest: `is due ${when(c.days)} (${fmtDate(c.dueDate, "MMM d")}): ${formatPeso(c.dueAmount)} to pay.`,
    })),
    ...billAlerts
      .filter((b) => b.status.state === "dueSoon")
      .map((b) => ({
        key: `bill-soon-${b.id}`,
        tone: "soon" as const,
        name: b.name,
        rest: `is due ${when(b.status.days)} (${fmtDate(b.status.dueDate, "MMM d")}): about ${formatPeso(b.amount)}.`,
      })),
  ];

  // Owners: what each is owed, and the payday that is ready to record.
  const ownerBal = ownerBalances(rows, owners.map((o) => o.id));
  const lastPaydayKey = paydays[0] ? paydays[0].date.toISOString().slice(0, 10) : null;
  const firstActivity = firstActivityDate(rows);
  const paydayDue = nextPaydayToRecord(lastPaydayKey, today, firstActivity);
  // The payday being worked toward: it can be tried out before its date, but not recorded.
  const paydayDay = paydayDue ?? upcomingPayday(lastPaydayKey, today, firstActivity);
  const paydayPeriod = periodProfit(rows, lastPaydayKey, paydayDay);
  const maxPercent = maxPercentEach(Math.max(owners.length, 2));
  const daysToPayday = daysBetween(today, paydayDay);
  const canPayday = !!paydayDue && owners.length >= 2 && paydayPeriod.profit > 0;
  // Why recording is not possible yet, in plain words (empty when it is).
  const paydayBlock = !paydayDue
    ? `Payday is ${fmtDate(paydayDay, "MMM d")}. You can record it then. Until then this shows what it would be today.`
    : owners.length < 2
      ? "Add your co-owner's login in Settings first, so the share can be split between you both."
      : paydayPeriod.profit <= 0
        ? "There is no profit in this period, so there is nothing to share yet."
        : "";

  // One line of the records list.
  const renderRecord = (e: (typeof entries)[number]) => {
    const isMoneyOut = e.kind === "EXPENSE";
    const what =
      e.kind === "INCOME"
        ? channelLabel(e.category)
        : e.kind === "EXPENSE"
          ? `${categoryLabel(e.category)} · paid with ${
            e.paidWith === "CASH"
              ? "production cash"
              : e.paidWith === "CARD"
                ? `card ${cardName.get(e.cardId ?? "") ?? ""}`.trim()
                : "bank"
          }`
          : e.kind === "CARD_PAYMENT"
            ? (cardName.get(e.cardId ?? "") ?? "card")
            : e.kind === "OWNER_DRAW"
              ? `${e.owner?.name ?? "Owner"} · ${e.category === "PAYDAY" ? "payday" : "taken between paydays"}`
              : KIND_LABEL[e.kind];
    return (
      <li key={e.id} className={`px-4 py-3 sm:px-5 ${e.voided ? "bg-slate-50" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-sm font-medium ${e.voided ? "text-slate-400 line-through" : "text-slate-900"}`}>
              {KIND_LABEL[e.kind] === what ? what : `${KIND_LABEL[e.kind]} · ${what}`}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {fmtDate(e.date.toISOString().slice(0, 10), "MMM d, yyyy")} · added by{" "}
              {e.createdByAdmin?.name ?? "someone"}
              {e.note ? ` · ${e.note}` : ""}
            </div>
            {e.voided && (
              <div className="mt-1 text-xs text-rose-700">
                Voided by {e.voidedByAdmin?.name ?? "someone"}: {e.voidReason}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-semibold ${
                e.voided ? "text-slate-400 line-through" : isMoneyOut ? "text-rose-700" : "text-slate-900"
              }`}
            >
              {formatPeso(Number(e.amount))}
            </span>
            {!e.voided && !e.paydayId && (
              <details className="relative">
                <summary className={`${pillClass("destructive", "sm")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                  Void
                </summary>
                <ActionForm
                  action={voidFinanceEntryForm}
                  compactError
                  className="absolute right-0 z-10 mt-1.5 flex w-64 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
                >
                  <input type="hidden" name="entryId" value={e.id} />
                  <label className="text-xs font-medium text-slate-700">Why is it wrong?</label>
                  <input name="reason" required minLength={3} className={`${inputClass} !py-1.5 !text-xs`} />
                  <PillButton variant="destructive" size="sm">
                    Void this entry
                  </PillButton>
                </ActionForm>
              </details>
            )}
          </div>
        </div>
      </li>
    );
  };

  // The newest few lines show first; the rest and the voided ones are tucked away so the page stays short.
  const activeEntries = monthEntries.filter((e) => !e.voided);
  const voidedEntries = monthEntries.filter((e) => e.voided);
  const RECENT = 10;

  return (
    <div className="space-y-6">
      <ReminderTicker reminders={reminders} />

      <SoftHeader
        title="Finance"
        description="Where our money comes from and where it goes. Owners only."
        actions={
          <>
            <FormDialog
              variant="primary"
              triggerLabel="+ Money received"
              title="Money received"
              description="A payout or payment that reached the bank."
            >
              <ActionForm action={addIncomeForm} multiEntry={{ clear: ["amount", "channel", "note"] }} className="space-y-3">
                <TodayField today={today} />
                <AmountField label="Amount received (₱)" />
                <div>
                  <label className={labelClass}>From</label>
                  <select name="channel" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {INCOME_CHANNELS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <NoteField />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PillButton name="after" value="again" className="flex-1">
                    Save &amp; add another
                  </PillButton>
                  <PillButton name="after" value="close" variant="secondary" className="flex-1">
                    Save &amp; close
                  </PillButton>
                </div>
              </ActionForm>
            </FormDialog>

            <FormDialog
              triggerLabel="+ Add expense"
              title="Add expense"
              description="Chicken, oil, gas, anything we spend on."
            >
              <ActionForm action={addExpenseForm} multiEntry={{ clear: ["amount", "category", "note"] }} className="space-y-3">
                <TodayField today={today} />
                <AmountField />
                <div>
                  <label className={labelClass}>Spent on</label>
                  <select name="category" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <PaidWithFields cards={cards.map((c) => ({ id: c.id, name: c.name }))} />
                <NoteField />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PillButton name="after" value="again" className="flex-1">
                    Save &amp; add another
                  </PillButton>
                  <PillButton name="after" value="close" variant="secondary" className="flex-1">
                    Save &amp; close
                  </PillButton>
                </div>
              </ActionForm>
            </FormDialog>

            <FormDialog
              triggerLabel="Cash withdrawal"
              title="Cash withdrawal"
              description="Cash taken from the bank for production. Not an expense."
            >
              <ActionForm action={addCashWithdrawalForm} multiEntry={{ clear: ["amount", "note"] }} className="space-y-3">
                <TodayField today={today} />
                <AmountField label="Amount withdrawn (₱)" />
                <NoteField />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PillButton name="after" value="again" className="flex-1">
                    Save &amp; add another
                  </PillButton>
                  <PillButton name="after" value="close" variant="secondary" className="flex-1">
                    Save &amp; close
                  </PillButton>
                </div>
              </ActionForm>
            </FormDialog>
          </>
        }
      />

      {!hasOpening && (
        <SoftCard accent="amber" compact>
          <h2 className="text-base font-medium text-slate-900">Set your starting balances</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Enter what you have today, so the bank and cash numbers start right. You only do this once.
          </p>
          <ActionForm action={setOpeningBalancesForm} className="mt-5 grid gap-4 sm:grid-cols-4 sm:items-end">
            <TodayField today={today} />
            <div>
              <label className={labelClass}>In the bank (₱)</label>
              <NumberInput name="bank" defaultValue="0" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cash on hand (₱)</label>
              <NumberInput name="cash" defaultValue="0" className={inputClass} />
            </div>
            <PillButton>Save starting balances</PillButton>
          </ActionForm>
        </SoftCard>
      )}

      <SoftCard compact>
        <div className="grid gap-6 sm:grid-cols-[1.2fr_1fr_1fr] sm:items-center sm:gap-8">
          <Metric compact big label="Total money" value={formatPeso(balances.total)} hint="Bank + production cash" />
          <div className="sm:border-l sm:border-slate-200 sm:pl-8">
            <Metric compact label="In the bank" value={formatPeso(balances.bank)} hint="Estimated from what is recorded" />
          </div>
          <div className="sm:border-l sm:border-slate-200 sm:pl-8">
            <Metric
              label="Production cash"
              value={formatPeso(balances.cash)}
              tone={cashLow ? "rose" : "amber"}
              hint={cashLow ? "Below zero: a withdrawal may be missing" : "Cash an owner is holding"}
            />
          </div>
        </div>
      </SoftCard>

      <SoftCard compact>
        <div>
          <div>
            <h2 className="text-base font-medium text-slate-900">Credit cards</h2>
            <p className="mt-0.5 text-sm text-slate-500">What is due on each card and when the bill is due.</p>
            {cardRows.length === 0 ? (
              <div className="mt-4">
                <EmptyState>No credit card added yet.</EmptyState>
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
                {cardRows.map((c) => (
                  <li key={c.id} className="min-w-0">
                    <CreditCardFace
                      name={c.name}
                      amount={formatPeso(c.dueAmount)}
                      amountLabel={c.statementDay ? "Due on the bill" : "Owed"}
                      status={c.overdue ? "overdue" : c.dueAmount > 0 ? (c.days <= 7 ? "soon" : "due") : "clear"}
                      statusText={
                        c.overdue
                          ? `Overdue since ${fmtDate(c.overdue.since, "MMM d")}`
                          : c.dueAmount > 0
                            ? `Due ${fmtDate(c.dueDate, "MMM d")} · ${
                                c.days === 0 ? "today" : c.days === 1 ? "tomorrow" : `in ${c.days} days`
                              }`
                            : c.statementDay
                              ? "Nothing due right now"
                              : `Due day ${fmtDate(c.dueDate, "MMM d")}`
                      }
                    />
                    {c.notYetBilled > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        {formatPeso(c.notYetBilled)} charged since the {c.statementDay}th, on next month&apos;s bill.
                        Total owed {formatPeso(c.owed)}.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {c.owed > 0 && (
                        <FormDialog
                          size="sm"
                          triggerLabel="Pay this card"
                          title={`Pay ${c.name}`}
                          description={
                            c.statementDay
                              ? `${formatPeso(c.dueAmount)} is due on the bill and ${formatPeso(c.owed)} is owed in total. The payment comes out of the bank.`
                              : `${formatPeso(c.owed)} is owed. The payment comes out of the bank.`
                          }
                        >
                          <ActionForm action={payCardForm} closeDialogOnSuccess className="space-y-3">
                            <input type="hidden" name="cardId" value={c.id} />
                            <TodayField today={today} />
                            <div>
                              <label className={labelClass}>Amount paid (₱)</label>
                              <NumberInput
                                name="amount"
                                required
                                defaultValue={c.dueAmount > 0 ? c.dueAmount : c.owed}
                                className={inputClass}
                              />
                            </div>
                            <NoteField />
                            <PillButton className="w-full">Record payment</PillButton>
                          </ActionForm>
                        </FormDialog>
                      )}
                      {!c.statementDay && (
                        <FormDialog
                          size="sm"
                          triggerLabel="Set statement day"
                          title={`${c.name} statement day`}
                          description="The day of the month the statement is printed. This lets Finance separate what is due from what is not billed yet."
                        >
                          <ActionForm action={setCardStatementDayForm} closeDialogOnSuccess className="space-y-3">
                            <input type="hidden" name="cardId" value={c.id} />
                            <div>
                              <label className={labelClass}>Statement day of the month</label>
                              <input
                                name="statementDay"
                                type="number"
                                min={1}
                                max={31}
                                required
                                inputMode="numeric"
                                placeholder="e.g. 17"
                                className={inputClass}
                              />
                            </div>
                            <PillButton className="w-full">Save statement day</PillButton>
                          </ActionForm>
                        </FormDialog>
                      )}
                      {c.owed === 0 && (
                        <ActionForm action={setCardActiveForm} compactError>
                          <input type="hidden" name="cardId" value={c.id} />
                          <input type="hidden" name="active" value="false" />
                          <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-800">
                            Remove card
                          </button>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <FormDialog
                size="sm"
                triggerLabel="+ Add card"
                title="Add a credit card"
                description="The name, the day the statement is printed, and the day the bill is due."
              >
                <ActionForm action={addCardForm} closeDialogOnSuccess className="space-y-3">
                  <div>
                    <label className={labelClass}>Card name</label>
                    <input name="name" required maxLength={40} placeholder="e.g. Metrobank" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Statement day of the month</label>
                    <input
                      name="statementDay"
                      type="number"
                      min={1}
                      max={31}
                      required
                      inputMode="numeric"
                      placeholder="e.g. 17"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Due day of the month</label>
                    <input
                      name="dueDay"
                      type="number"
                      min={1}
                      max={31}
                      required
                      inputMode="numeric"
                      placeholder="e.g. 5"
                      className={inputClass}
                    />
                  </div>
                  <PillButton className="w-full">Add card</PillButton>
                </ActionForm>
              </FormDialog>
            </div>
          </div>
        </div>
        {totalOwed > 0 && (
          <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
            After the cards are paid we would have{" "}
            <span className="font-medium text-slate-800">{formatPeso(afterCards)}</span>.
          </p>
        )}
      </SoftCard>

      <Banner
        title={month === current ? "This month" : monthLabel(month)}
        description={`Money received and spent in ${monthLabel(month)}. Pick another month to look back.`}
      >
        <MonthPicker value={month} current={current} basePath="/admin/finance" />
      </Banner>

      <SoftCard compact>
        <div className="grid gap-6 sm:grid-cols-3 sm:items-center sm:gap-8">
          <Metric compact label="Money received" value={formatPeso(summary.received)} tone="green" />
          <div className="sm:border-l sm:border-slate-200 sm:pl-8">
            <Metric compact label="Money spent" value={formatPeso(summary.spent)} tone="rose" />
          </div>
          <div className="sm:border-l sm:border-slate-200 sm:pl-8">
            <Metric
              big
              label="Estimated profit"
              value={formatPeso(summary.profit)}
              tone={summary.profit < 0 ? "rose" : "dark"}
              hint="Received minus spent"
            />
          </div>
        </div>
        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 sm:gap-8">
          <div>
            <div className="text-sm text-slate-500">Making and selling</div>
            <div className="text-base font-semibold text-slate-800">{formatPeso(summary.productionCosts)}</div>
            <div className="text-xs text-slate-400">Chicken, ingredients, oil, gas, jars, delivery</div>
          </div>
          <div className="sm:border-l sm:border-slate-200 sm:pl-8">
            <div className="text-sm text-slate-500">Operating costs</div>
            <div className="text-base font-semibold text-slate-800">{formatPeso(summary.operatingCosts)}</div>
            <div className="text-xs text-slate-400">Rent, bills, salaries, ads, taxes, other</div>
          </div>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
          Cash taken out of the bank this month: {formatPeso(summary.withdrawn)}{" "}
          <span className="text-slate-400">(moved to production cash, not counted as spending)</span>
        </p>
        {summary.drawn > 0 && (
          <p className="mt-1 text-sm text-slate-500">
            Taken by the owners this month: {formatPeso(summary.drawn)}{" "}
            <span className="text-slate-400">(not counted as spending)</span>
          </p>
        )}
      </SoftCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SoftCard compact>
          <h2 className="text-base font-medium text-slate-900">Where the money came from</h2>
          <p className="mt-0.5 text-sm text-slate-500">Money received this month, by channel.</p>
          <div className="mt-5">
            {summary.byChannel.length === 0 ? (
              <EmptyState>No money received in {monthLabel(month)} yet.</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {summary.byChannel.map((c) => {
                  const style = CHANNEL_STYLE[c.code] ?? NEUTRAL_CHANNEL_STYLE;
                  const share = summary.received > 0 ? Math.round((c.amount / summary.received) * 100) : 0;
                  return (
                    <div key={c.code} className={`rounded-2xl p-4 ${style.box}`}>
                      <div className={`text-sm font-medium ${style.label}`}>{c.label}</div>
                      <div className={`mt-0.5 text-lg font-semibold tracking-tight ${style.value}`}>
                        {formatPeso(c.amount)}
                      </div>
                      <div className={`mt-0.5 text-xs ${style.label}`}>{share}% of money received</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SoftCard>

        <SoftCard compact>
          <h2 className="text-base font-medium text-slate-900">Where the money went</h2>
          <p className="mt-0.5 text-sm text-slate-500">Spending this month, biggest first.</p>
          <div className="mt-5">
            {summary.byCategory.length === 0 ? (
              <EmptyState>No expenses in {monthLabel(month)} yet.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {summary.byCategory.map((c) => (
                  <li key={c.code}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{c.label}</span>
                      <span className="text-slate-700">{formatPeso(c.amount)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-rose-400"
                        style={{ width: `${Math.max(4, Math.round((c.amount / biggestSpend) * 100))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SoftCard>
      </div>

      <SoftCard padded={false}>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-5 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <h2 className="text-base font-medium text-slate-900">Monthly bills</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {billRows.length === 0
                  ? "Rent, internet, electricity: save each once."
                  : `${billRows.filter((b) => b.status.state === "recorded").length} of ${billRows.length} recorded this month`}
                {billAlerts.length > 0 && (
                  <span className="font-medium text-amber-700"> · {billAlerts.length} need attention</span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium text-accent-800 group-open:hidden">Show</span>
            <span className="hidden shrink-0 text-sm font-medium text-accent-800 group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-slate-100 px-5 pb-5 pt-1 sm:px-7 sm:pb-7">
            <p className="mt-3 text-sm text-slate-500">
              Rent, internet, electricity and the like. Save each once, then record it with one tap every month.
            </p>
            {billRows.length === 0 ? (
              <div className="mt-4">
                <EmptyState>No monthly bills saved yet.</EmptyState>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {billRows.map((b) => (
                  <li key={b.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800">{b.name}</div>
                        <div className="text-xs text-slate-500">
                          {categoryLabel(b.category)} · paid with {b.paidLabel}
                        </div>
                        {b.status.state === "recorded" ? (
                          <div className="mt-0.5 text-xs font-medium text-emerald-700">Recorded for {monthLabel(current)}</div>
                        ) : b.status.state === "overdue" ? (
                          <div className="mt-0.5 text-xs font-medium text-rose-700">
                            Was due {fmtDate(b.status.dueDate, "MMM d")}
                          </div>
                        ) : (
                          <div
                            className={`mt-0.5 text-xs ${b.status.state === "dueSoon" ? "font-medium text-amber-700" : "text-slate-500"}`}
                          >
                            Due {fmtDate(b.status.dueDate, "MMM d")}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-base font-semibold text-slate-900">{formatPeso(b.amount)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {b.status.state !== "recorded" && (
                        <FormDialog
                          size="sm"
                          variant="primary"
                          triggerLabel="Record this month"
                          title={`Record ${b.name}`}
                          description={`Saved as an expense, paid with ${b.paidLabel}. Change the amount if this month is different.`}
                        >
                          <ActionForm action={recordBillForm} closeDialogOnSuccess className="space-y-3">
                            <input type="hidden" name="billId" value={b.id} />
                            <TodayField today={today} />
                            <div>
                              <label className={labelClass}>Amount (₱)</label>
                              <NumberInput name="amount" required defaultValue={b.amount} className={inputClass} />
                            </div>
                            <NoteField />
                            <PillButton className="w-full">Record {b.name}</PillButton>
                          </ActionForm>
                        </FormDialog>
                      )}
                      <FormDialog
                        size="sm"
                        triggerLabel="Edit"
                        title={`Edit ${b.name}`}
                        description="Change the usual amount or the day it is due. Past records stay as they are."
                      >
                        <ActionForm action={updateBillForm} closeDialogOnSuccess className="space-y-3">
                          <input type="hidden" name="billId" value={b.id} />
                          <div>
                            <label className={labelClass}>Usual amount (₱)</label>
                            <NumberInput name="amount" required defaultValue={b.amount} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Due day of the month</label>
                            <input
                              name="dueDay"
                              type="number"
                              min={1}
                              max={31}
                              required
                              inputMode="numeric"
                              defaultValue={b.dueDay}
                              className={inputClass}
                            />
                          </div>
                          <PillButton className="w-full">Save changes</PillButton>
                        </ActionForm>
                      </FormDialog>
                      <ActionForm action={setBillActiveForm} compactError>
                        <input type="hidden" name="billId" value={b.id} />
                        <input type="hidden" name="active" value="false" />
                        <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-800">
                          Remove
                        </button>
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <FormDialog
                size="sm"
                triggerLabel="+ Add monthly bill"
                title="Add a monthly bill"
                description="Something you pay every month. You can change the amount each time you record it."
              >
                <ActionForm action={addBillForm} closeDialogOnSuccess className="space-y-3">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input name="name" required maxLength={40} placeholder="e.g. Rent" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Kind of bill</label>
                    <select name="category" required defaultValue="" className={inputClass}>
                      <option value="" disabled>
                        Choose…
                      </option>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Usual amount (₱)</label>
                    <NumberInput name="amount" required placeholder="0.00" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Due day of the month</label>
                    <input
                      name="dueDay"
                      type="number"
                      min={1}
                      max={31}
                      required
                      inputMode="numeric"
                      placeholder="e.g. 5"
                      className={inputClass}
                    />
                  </div>
                  <PaidWithFields cards={cards.map((c) => ({ id: c.id, name: c.name }))} defaultPaidWith="BANK" />
                  <PillButton className="w-full">Add bill</PillButton>
                </ActionForm>
              </FormDialog>
            </div>

          </div>
        </details>
      </SoftCard>

      <SoftCard padded={false}>
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-base font-medium text-slate-900">Production cash log</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Every withdrawal and cash expense, newest first, with the cash left after each one.
          </p>
        </div>
        <div className="mt-4">
          {log.length === 0 ? (
            <div className="p-4 pt-0 sm:p-5 sm:pt-0">
              <EmptyState>No cash movements yet. Add a cash withdrawal to start.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {log.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">
                      {l.kind === "CASH_WITHDRAWAL"
                        ? "Cash withdrawal"
                        : l.kind === "OPENING_CASH"
                          ? "Starting cash"
                          : categoryLabel(l.category)}
                    </div>
                    <div className="text-xs text-slate-500">{fmtDate(l.date, "MMM d, yyyy")}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${l.change >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {l.change >= 0 ? "+" : "−"}
                      {formatPeso(Math.abs(l.change))}
                    </div>
                    <div className="text-xs text-slate-500">left {formatPeso(l.balanceAfter)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SoftCard>

      <SoftCard padded={false}>
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-base font-medium text-slate-900">Records for {monthLabel(month)}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            A wrong entry is voided, not deleted, so corrections can be reviewed.
          </p>
        </div>
        <div className="mt-4">
          {monthEntries.length === 0 ? (
            <div className="p-4 pt-0 sm:p-5 sm:pt-0">
              <EmptyState>No finance records for this month yet.</EmptyState>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {activeEntries.slice(0, RECENT).map(renderRecord)}
              </ul>
              {activeEntries.length > RECENT && (
                <details className="group border-t border-slate-100">
                  <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-accent-800 hover:bg-slate-50 sm:px-7 [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show {activeEntries.length - RECENT} older records</span>
                    <span className="hidden group-open:inline">Hide older records</span>
                  </summary>
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {activeEntries.slice(RECENT).map(renderRecord)}
                  </ul>
                </details>
              )}
              {voidedEntries.length > 0 && (
                <details className="group border-t border-slate-100">
                  <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 sm:px-7 [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show voided records ({voidedEntries.length})</span>
                    <span className="hidden group-open:inline">Hide voided records</span>
                  </summary>
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {voidedEntries.map(renderRecord)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </SoftCard>

      <SoftCard compact>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-slate-900">Owners&apos; share</h2>
            <p className="mt-0.5 text-sm text-slate-500">What each owner takes on the 15th and 30th.</p>
          </div>
          <FormDialog
            size="sm"
            triggerLabel="+ Owner draw"
            title="Owner draw"
            description="Money an owner takes between paydays (house bill, family, groceries). It comes out of the bank and off their next payday share."
          >
            <ActionForm action={addOwnerDrawForm} closeDialogOnSuccess className="space-y-3">
              <TodayField today={today} />
              <div>
                <label className={labelClass}>Who took it</label>
                <select
                  name="ownerId"
                  required
                  defaultValue={owners.some((o) => o.id === session?.user?.id) ? session?.user?.id : ""}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <AmountField label="Amount taken (₱)" />
              <div>
                <label className={labelClass}>What it was for (optional)</label>
                <input name="note" maxLength={300} placeholder="e.g. house bill" className={inputClass} />
              </div>
              <PillButton className="w-full">Record draw</PillButton>
            </ActionForm>
          </FormDialog>
        </div>

        <ActionForm action={recordPaydayForm} successMessage="Payday recorded" className="mt-4">
          <input type="hidden" name="paydayDate" value={paydayDay} />
          <PaydayPanel
            title={
              paydayDue
                ? `Payday ${fmtDate(paydayDay, "MMM d")} is ready`
                : `Payday ${fmtDate(paydayDay, "MMM d")} · ${daysToPayday === 1 ? "tomorrow" : `in ${daysToPayday} days`}`
            }
            subtitle={
              paydayPeriod.received === 0 && paydayPeriod.spent === 0
                ? "Nothing recorded for this payday yet."
                : `Profit ${paydayDue ? "from" : "so far from"} ${fmtDate(paydayPeriod.start, "MMM d")}${
                    paydayDue ? ` to ${fmtDate(paydayPeriod.end, "MMM d")}` : ""
                  }: ${formatPeso(paydayPeriod.profit)}`
            }
            profit={paydayPeriod.profit}
            owners={owners.map((o) => ({
              id: o.id,
              name: o.name,
              before: ownerBal.get(o.id) ?? 0,
              takenSince: rows
                .filter(
                  (r) =>
                    r.kind === "OWNER_DRAW" && !r.voided && r.ownerId === o.id && (!lastPaydayKey || r.date > lastPaydayKey)
                )
                .reduce((t, r) => t + r.amount, 0),
            }))}
            maxPercent={maxPercent}
            defaultPercent={paydays[0] ? Number(paydays[0].percent) : undefined}
            canRecord={canPayday}
            hint={paydayDue ? undefined : `Available on ${fmtDate(paydayDay, "MMM d")}`}
            blockReason={paydayDue ? paydayBlock : ""}
          />
        </ActionForm>

        {paydays.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-medium text-slate-800">Past paydays</h3>
            <p className="text-xs text-slate-500">Tap a row to see each owner.</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {paydays.map((d, i) => {
                const perOwner = owners.map((o) => ({
                  id: o.id,
                  name: o.name,
                  share: d.entries.filter((e) => e.ownerId === o.id && e.kind === "OWNER_SHARE").reduce((t, e) => t + Number(e.amount), 0),
                  paid: d.entries.filter((e) => e.ownerId === o.id && e.kind === "OWNER_DRAW").reduce((t, e) => t + Number(e.amount), 0),
                }));
                const paidTotal = perOwner.reduce((t, o) => t + o.paid, 0);
                const profit = Number(d.profit);
                return (
                  <li key={d.id}>
                    <details>
                      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-3 text-sm sm:grid-cols-[6.5rem_1fr_auto] [&::-webkit-details-marker]:hidden">
                        <span className="font-medium text-slate-900">{fmtDate(d.date.toISOString().slice(0, 10), "MMM d, yyyy")}</span>
                        <span className="order-3 col-span-2 text-xs text-slate-500 sm:order-none sm:col-span-1 sm:text-sm">
                          Profit {formatPeso(profit)} · {Number(d.percent)}% each
                          {profit > 0 && ` · ${Math.round((paidTotal / profit) * 1000) / 10}% of profit`}
                        </span>
                        <span className="font-semibold text-slate-900">{formatPeso(paidTotal)} paid</span>
                      </summary>
                      <div className="pb-3">
                        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
                          {perOwner.map((o) => (
                            <li key={o.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                              <span className="text-slate-700">{o.name}</span>
                              <span className="text-right">
                                <span className="font-semibold text-slate-900">{formatPeso(o.paid)}</span>
                                {Math.abs(o.share - o.paid) > 0.004 && (
                                  <span className="block text-xs text-slate-500">
                                    share {formatPeso(o.share)}, {formatPeso(o.share - o.paid)} offset by earlier draws
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {i === 0 && (
                          <details className="relative mt-2">
                            <summary className={`${pillClass("destructive", "sm")} inline-flex cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                              Void this payday
                            </summary>
                            <ActionForm
                              action={voidPaydayForm}
                              compactError
                              className="mt-1.5 flex w-64 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
                            >
                              <input type="hidden" name="paydayId" value={d.id} />
                              <label className="text-xs font-medium text-slate-700">Why is it wrong?</label>
                              <input name="reason" required minLength={3} className={`${inputClass} !py-1.5 !text-xs`} />
                              <PillButton variant="destructive" size="sm">
                                Void this payday
                              </PillButton>
                            </ActionForm>
                          </details>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SoftCard>

      <p className="text-xs text-slate-400">
        Estimated profit is money received minus money spent. It is a management view, not a tax return. Cash
        withdrawals, owner draws and starting balances are not counted as spending.
      </p>
    </div>
  );
}
