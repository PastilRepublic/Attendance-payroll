import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { localDateKey } from "@/lib/payroll";
import { formatPeso } from "@/lib/format";
import { currentMonthKey, isMonthKey, monthLabel } from "@/lib/payPeriods";
import {
  EXPENSE_CATEGORIES,
  INCOME_CHANNELS,
  cashLog,
  categoryLabel,
  channelLabel,
  computeBalances,
  summarizeMonth,
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
import { inputClass, labelClass, pillClass, smallLabelClass } from "@/components/ui/styles";
import {
  addCashWithdrawalForm,
  addExpenseForm,
  addIncomeForm,
  setOpeningBalancesForm,
  voidFinanceEntryForm,
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
    },
  });

  const rows: FinanceRow[] = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    kind: e.kind,
    amount: Number(e.amount),
    category: e.category,
    paidWith: e.paidWith,
    voided: e.voided,
    createdAt: e.createdAt.getTime(),
  }));

  const hasOpening = rows.some((r) => (r.kind === "OPENING_BANK" || r.kind === "OPENING_CASH") && !r.voided);
  const balances = computeBalances(rows);
  const summary = summarizeMonth(rows, month);
  const log = cashLog(rows).reverse().slice(0, 30);
  const monthEntries = entries.filter((e) => e.date.toISOString().slice(0, 10).startsWith(month));
  const biggestSpend = summary.byCategory[0]?.amount ?? 0;
  const cashLow = balances.cash < 0;

  return (
    <div className="space-y-8">
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
                <div>
                  <label className={labelClass}>Paid with</label>
                  <select name="paidWith" required defaultValue="CASH" className={inputClass}>
                    <option value="CASH">Production cash</option>
                    <option value="BANK">Bank</option>
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
        <SoftCard accent="amber">
          <h2 className="text-lg font-medium text-slate-900">Set your starting balances</h2>
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

      <SoftCard className="sm:!p-8">
        <div className="grid gap-6 sm:grid-cols-[1.2fr_1fr_1fr] sm:items-center sm:gap-8">
          <Metric big label="Total money" value={formatPeso(balances.total)} hint="Bank + production cash" />
          <div className="sm:border-l sm:border-slate-200 sm:pl-8">
            <Metric label="In the bank" value={formatPeso(balances.bank)} hint="Estimated from what is recorded" />
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

      <Banner
        title={month === current ? "This month" : monthLabel(month)}
        description={`Money received and spent in ${monthLabel(month)}. Pick another month to look back.`}
      >
        <MonthPicker value={month} current={current} basePath="/admin/finance" />
      </Banner>

      <SoftCard className="sm:!p-8">
        <div className="grid gap-6 sm:grid-cols-3 sm:items-center sm:gap-8">
          <Metric label="Money received" value={formatPeso(summary.received)} tone="green" />
          <div className="sm:border-l sm:border-slate-200 sm:pl-8">
            <Metric label="Money spent" value={formatPeso(summary.spent)} tone="rose" />
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
        <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
          Cash taken out of the bank this month: {formatPeso(summary.withdrawn)}{" "}
          <span className="text-slate-400">(moved to production cash, not counted as spending)</span>
        </p>
      </SoftCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SoftCard>
          <h2 className="text-lg font-medium text-slate-900">Where the money came from</h2>
          <p className="mt-0.5 text-sm text-slate-500">Money received this month, by channel.</p>
          <div className="mt-5">
            {summary.byChannel.length === 0 ? (
              <EmptyState>No money received in {monthLabel(month)} yet.</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {summary.byChannel.map((c) => (
                  <div key={c.code} className="rounded-2xl border border-slate-300 p-4">
                    <div className={smallLabelClass}>{c.label}</div>
                    <div className="mt-1 text-xl font-extrabold tracking-tight text-emerald-800">
                      {formatPeso(c.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SoftCard>

        <SoftCard>
          <h2 className="text-lg font-medium text-slate-900">Where the money went</h2>
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
        <div className="px-5 pt-5 sm:px-7 sm:pt-7">
          <h2 className="text-lg font-medium text-slate-900">Production cash log</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Every withdrawal and cash expense, newest first, with the cash left after each one.
          </p>
        </div>
        <div className="mt-4">
          {log.length === 0 ? (
            <div className="p-5 pt-0 sm:p-7 sm:pt-0">
              <EmptyState>No cash movements yet. Add a cash withdrawal to start.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {log.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-7">
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
        <div className="px-5 pt-5 sm:px-7 sm:pt-7">
          <h2 className="text-lg font-medium text-slate-900">Records for {monthLabel(month)}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            A wrong entry is voided, not deleted, so corrections can be reviewed.
          </p>
        </div>
        <div className="mt-4">
          {monthEntries.length === 0 ? (
            <div className="p-5 pt-0 sm:p-7 sm:pt-0">
              <EmptyState>No finance records for this month yet.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {monthEntries.map((e) => {
                const isMoneyOut = e.kind === "EXPENSE";
                const what =
                  e.kind === "INCOME"
                    ? channelLabel(e.category)
                    : e.kind === "EXPENSE"
                      ? `${categoryLabel(e.category)} · paid with ${e.paidWith === "CASH" ? "production cash" : "bank"}`
                      : KIND_LABEL[e.kind];
                return (
                  <li key={e.id} className={`px-5 py-4 sm:px-7 ${e.voided ? "bg-slate-50" : ""}`}>
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
                        {!e.voided && (
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
              })}
            </ul>
          )}
        </div>
      </SoftCard>

      <p className="text-xs text-slate-400">
        Estimated profit is money received minus money spent. It is a management view, not a tax return. Cash
        withdrawals and starting balances are not counted as spending. Payroll and credit cards come in a later step.
      </p>
    </div>
  );
}
