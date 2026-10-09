/**
 * The owners' money rules, kept free of database code so they can be tested.
 *
 * Money sits in two places: the BANK and the PRODUCTION CASH an owner holds.
 * - Money received (platform payouts, direct, resellers, rebranding) goes into the bank.
 * - A cash withdrawal moves money from the bank to the production cash. It is NOT an
 *   expense -- the expense is when the cash is spent.
 * - An expense paid with CASH comes out of the production cash; one paid from the BANK
 *   comes out of the bank. Neither is ever taken off twice.
 * - Voided lines count for nothing but stay visible in the records.
 */

export type FinanceKindCode = "OPENING_BANK" | "OPENING_CASH" | "INCOME" | "EXPENSE" | "CASH_WITHDRAWAL";
export type PaidWithCode = "CASH" | "BANK";

export interface FinanceRow {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  kind: FinanceKindCode;
  amount: number;
  category: string | null;
  paidWith: PaidWithCode | null;
  voided: boolean;
  /** Creation time in milliseconds, to put same-day lines in the order they were entered. */
  createdAt: number;
}

/** Where money comes from. Codes are stored on the line; labels are for the screen. */
export const INCOME_CHANNELS = [
  { code: "SHOPEE", label: "Shopee" },
  { code: "TIKTOK", label: "TikTok Shop" },
  { code: "DIRECT", label: "Direct customers" },
  { code: "RESELLER", label: "Resellers" },
  { code: "REBRANDING", label: "Rebranding" },
] as const;

/** What money is spent on. */
export const EXPENSE_CATEGORIES = [
  { code: "CHICKEN", label: "Chicken" },
  { code: "INGREDIENTS", label: "Ingredients" },
  { code: "OIL", label: "Cooking oil" },
  { code: "GAS", label: "Gas" },
  { code: "PACKAGING", label: "Jars & packaging" },
  { code: "DELIVERY", label: "Delivery" },
  { code: "RENT", label: "Rent" },
  { code: "UTILITIES", label: "Electricity & water" },
  { code: "SALARIES", label: "Salaries" },
  { code: "OTHER", label: "Other" },
] as const;

export const channelLabel = (code: string | null) =>
  INCOME_CHANNELS.find((c) => c.code === code)?.label ?? code ?? "Other";
export const categoryLabel = (code: string | null) =>
  EXPENSE_CATEGORIES.find((c) => c.code === code)?.label ?? code ?? "Other";

const round2 = (n: number) => Math.round(n * 100) / 100;

const live = (rows: FinanceRow[]) => rows.filter((r) => !r.voided);

export interface Balances {
  bank: number;
  /** The production cash the owners hold. Can dip below zero if a withdrawal wasn't recorded. */
  cash: number;
  /** Bank plus cash. */
  total: number;
}

/** Bank, production cash and the total, as of every line entered so far. */
export function computeBalances(rows: FinanceRow[]): Balances {
  let bank = 0;
  let cash = 0;
  for (const r of live(rows)) {
    if (r.kind === "OPENING_BANK") bank += r.amount;
    else if (r.kind === "OPENING_CASH") cash += r.amount;
    else if (r.kind === "INCOME") bank += r.amount;
    else if (r.kind === "CASH_WITHDRAWAL") {
      bank -= r.amount;
      cash += r.amount;
    } else if (r.kind === "EXPENSE") {
      if (r.paidWith === "CASH") cash -= r.amount;
      else bank -= r.amount;
    }
  }
  return { bank: round2(bank), cash: round2(cash), total: round2(bank + cash) };
}

export interface MonthSummary {
  received: number;
  spent: number;
  /** Money received minus money spent. */
  profit: number;
  /** Cash taken out of the bank this month (not an expense). */
  withdrawn: number;
  byChannel: { code: string; label: string; amount: number }[];
  byCategory: { code: string; label: string; amount: number }[];
}

/** The month's money in and out, by channel and by category. Starting balances never count. */
export function summarizeMonth(rows: FinanceRow[], monthKey: string): MonthSummary {
  const inMonth = live(rows).filter((r) => r.date.startsWith(monthKey));
  const sum = (kind: FinanceKindCode) =>
    round2(inMonth.filter((r) => r.kind === kind).reduce((s, r) => s + r.amount, 0));
  const received = sum("INCOME");
  const spent = sum("EXPENSE");

  const group = (kind: FinanceKindCode, codes: readonly { code: string; label: string }[]) => {
    const totals = new Map<string, number>();
    for (const r of inMonth.filter((x) => x.kind === kind)) {
      const key = r.category ?? "OTHER";
      totals.set(key, (totals.get(key) ?? 0) + r.amount);
    }
    const known = codes.map((c) => ({ code: c.code, label: c.label, amount: round2(totals.get(c.code) ?? 0) }));
    // A code that is no longer in the list still shows, so no money goes missing from the breakdown.
    const extra = [...totals.keys()]
      .filter((k) => !codes.some((c) => c.code === k))
      .map((k) => ({ code: k, label: k, amount: round2(totals.get(k) ?? 0) }));
    return [...known, ...extra].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  };

  return {
    received,
    spent,
    profit: round2(received - spent),
    withdrawn: sum("CASH_WITHDRAWAL"),
    byChannel: group("INCOME", INCOME_CHANNELS),
    byCategory: group("EXPENSE", EXPENSE_CATEGORIES),
  };
}

export interface CashLogLine {
  id: string;
  date: string;
  kind: "OPENING_CASH" | "CASH_WITHDRAWAL" | "EXPENSE";
  /** Positive when cash comes in, negative when it is spent. */
  change: number;
  category: string | null;
  /** The production cash left after this line. */
  balanceAfter: number;
}

/**
 * Every line that touches the production cash, oldest first, with the cash left after
 * each one -- so "he took 50,000, spent 41,200, 8,800 left" can be read straight down.
 */
export function cashLog(rows: FinanceRow[]): CashLogLine[] {
  const lines = live(rows)
    // A starting cash of 0 would only be a pointless line at the top.
    .filter(
      (r) =>
        (r.kind === "OPENING_CASH" && r.amount > 0) ||
        r.kind === "CASH_WITHDRAWAL" ||
        (r.kind === "EXPENSE" && r.paidWith === "CASH")
    )
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  let balance = 0;
  return lines.map((r) => {
    const change = r.kind === "EXPENSE" ? -r.amount : r.amount;
    balance = round2(balance + change);
    return {
      id: r.id,
      date: r.date,
      kind: r.kind as CashLogLine["kind"],
      change,
      category: r.category,
      balanceAfter: balance,
    };
  });
}
