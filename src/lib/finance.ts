/**
 * The owners' money rules, kept free of database code so they can be tested.
 *
 * Money sits in two places: the BANK and the PRODUCTION CASH an owner holds.
 * - Money received (platform payouts, direct, resellers, rebranding) goes into the bank.
 * - A cash withdrawal moves money from the bank to the production cash. It is NOT an
 *   expense -- the expense is when the cash is spent.
 * - An expense paid with CASH comes out of the production cash; one paid from the BANK
 *   comes out of the bank. Neither is ever taken off twice.
 * - An expense charged to a CARD changes neither: it adds to what is owed on that card. The
 *   bank drops only when the card is paid (a card payment).
 * - Owners: an owner DRAW takes money out of the bank and is never an expense. A SHARE is what
 *   an owner is entitled to at a payday (a percentage of the profit since the last payday); it
 *   moves no money. What an owner is still owed = shares - draws, so money taken early comes
 *   off the next payday and both owners end up equal.
 * - Voided lines count for nothing but stay visible in the records.
 */

export type FinanceKindCode =
  | "OPENING_BANK"
  | "OPENING_CASH"
  | "INCOME"
  | "EXPENSE"
  | "CASH_WITHDRAWAL"
  | "CARD_PAYMENT"
  | "OWNER_SHARE"
  | "OWNER_DRAW";
export type PaidWithCode = "CASH" | "BANK" | "CARD";

export interface FinanceRow {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  kind: FinanceKindCode;
  amount: number;
  category: string | null;
  paidWith: PaidWithCode | null;
  /** Which card an expense was charged to, or a card payment went to. */
  cardId: string | null;
  /** Which owner a share or a draw belongs to. */
  ownerId?: string | null;
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

/**
 * One color per sales channel, so the cards are easy to tell apart at a glance. These stay
 * clear of red (money out) so a channel is never mistaken for spending.
 */
export const CHANNEL_STYLE: Record<string, { box: string; label: string; value: string }> = {
  SHOPEE: { box: "bg-orange-50", label: "text-orange-800", value: "text-orange-950" },
  TIKTOK: { box: "bg-violet-50", label: "text-violet-800", value: "text-violet-950" },
  DIRECT: { box: "bg-emerald-50", label: "text-emerald-800", value: "text-emerald-950" },
  RESELLER: { box: "bg-sky-50", label: "text-sky-800", value: "text-sky-950" },
  REBRANDING: { box: "bg-amber-50", label: "text-amber-800", value: "text-amber-950" },
};

export const NEUTRAL_CHANNEL_STYLE = { box: "bg-slate-50", label: "text-slate-600", value: "text-slate-900" };

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
  { code: "ADVERTISING", label: "Advertising" },
  { code: "TAXES", label: "Taxes (VAT, other)" },
  { code: "OTHER", label: "Other" },
] as const;

/**
 * What it costs to make and sell the product, as opposed to the costs of running the business.
 * Anything not listed here (including a category added later) counts as an operating cost.
 */
export const PRODUCTION_COST_CODES: readonly string[] = ["CHICKEN", "INGREDIENTS", "OIL", "GAS", "PACKAGING", "DELIVERY"];

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
    } else if (r.kind === "CARD_PAYMENT" || r.kind === "OWNER_DRAW") {
      bank -= r.amount;
    } else if (r.kind === "EXPENSE") {
      if (r.paidWith === "CASH") cash -= r.amount;
      else if (r.paidWith !== "CARD") bank -= r.amount;
      // CARD: owed on the card for now; see cardBalances.
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
  /** Money owners took out of the bank this month (not an expense). */
  drawn: number;
  /** Spending on making and selling: chicken, ingredients, oil, gas, jars, delivery. */
  productionCosts: number;
  /** Spending on running the business: rent, bills, salaries, ads, taxes, other. */
  operatingCosts: number;
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
  const productionCosts = round2(
    inMonth
      .filter((r) => r.kind === "EXPENSE" && r.category && PRODUCTION_COST_CODES.includes(r.category))
      .reduce((t, r) => t + r.amount, 0)
  );

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
    drawn: sum("OWNER_DRAW"),
    productionCosts,
    operatingCosts: round2(spent - productionCosts),
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

export interface CardBalance {
  cardId: string;
  /** Charged to the card and not yet paid. */
  owed: number;
}

/** What is owed on each card: everything charged to it minus what has been paid toward it. */
export function cardBalances(rows: FinanceRow[], cardIds: string[]): CardBalance[] {
  const owed = new Map<string, number>(cardIds.map((id) => [id, 0]));
  for (const r of live(rows)) {
    if (!r.cardId || !owed.has(r.cardId)) continue;
    if (r.kind === "EXPENSE" && r.paidWith === "CARD") owed.set(r.cardId, owed.get(r.cardId)! + r.amount);
    else if (r.kind === "CARD_PAYMENT") owed.set(r.cardId, owed.get(r.cardId)! - r.amount);
  }
  return cardIds.map((cardId) => ({ cardId, owed: round2(owed.get(cardId) ?? 0) }));
}

/** The last day of a month, given its year and 1-based month. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The next date (YYYY-MM-DD) a card bill is due: this month's due day if it has not passed
 * yet (today counts), otherwise next month's. A due day of 31 in a short month falls on that
 * month's last day.
 */
export function nextDueDate(dueDay: number, todayKey: string): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  const dueThisMonth = Math.min(dueDay, daysInMonth(y, m));
  if (d <= dueThisMonth) return `${todayKey.slice(0, 8)}${String(dueThisMonth).padStart(2, "0")}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const due = Math.min(dueDay, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(due).padStart(2, "0")}`;
}

/** Whole days from one date to another (negative if the second is earlier). */
export function daysBetween(fromKey: string, toKey: string): number {
  const toTime = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toTime(toKey) - toTime(fromKey)) / 86400000);
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateKey = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const clampDay = (y: number, m: number, day: number) => Math.min(day, daysInMonth(y, m));

/**
 * The date of the latest statement on or before today: this month's statement day if it has
 * come (today counts), otherwise last month's. Charges dated up to and including it are on
 * that bill; later ones wait for the next.
 */
export function lastStatementDate(statementDay: number, todayKey: string): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  const thisMonth = clampDay(y, m, statementDay);
  if (d >= thisMonth) return dateKey(y, m, thisMonth);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return dateKey(py, pm, clampDay(py, pm, statementDay));
}

/** The statement date one month before the given one. */
export function previousStatementDate(statementDay: number, statementDate: string): string {
  const [y, m] = statementDate.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return dateKey(py, pm, clampDay(py, pm, statementDay));
}

/**
 * When the bill for a statement is due: the same month if the due day comes after the
 * statement day, otherwise the next month (statement on the 17th, due on the 5th means the
 * 5th of next month).
 */
export function dueDateFor(statementDate: string, dueDay: number): string {
  const [y, m, d] = statementDate.split("-").map(Number);
  if (dueDay > d) return dateKey(y, m, clampDay(y, m, dueDay));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return dateKey(ny, nm, clampDay(ny, nm, dueDay));
}

export interface CardDue {
  /** Everything charged to the card minus everything paid. */
  owed: number;
  /** The latest statement date, and when its bill is due. */
  statementDate: string;
  dueDate: string;
  /** What is still due on that statement (charges up to the statement date, minus payments since). */
  dueAmount: number;
  /** Charged after the statement date: on next month's bill. */
  notYetBilled: number;
  /** Set when a bill's due date has passed with money still unpaid. */
  overdue: { amount: number; since: string } | null;
}

/**
 * Splits one card's balance into "due on the latest bill" and "not billed yet", and spots a
 * bill that is past its due date. Charges count by the date they were made.
 */
export function cardDue(
  rows: FinanceRow[],
  cardId: string,
  statementDay: number,
  dueDay: number,
  todayKey: string
): CardDue {
  const mine = live(rows).filter((r) => r.cardId === cardId);
  const total = (kind: "EXPENSE" | "CARD_PAYMENT", until?: string) =>
    mine
      .filter((r) => r.kind === kind && (kind === "CARD_PAYMENT" || r.paidWith === "CARD") && (!until || r.date <= until))
      .reduce((sum, r) => sum + r.amount, 0);

  const owed = round2(total("EXPENSE") - total("CARD_PAYMENT"));
  const dueOn = (statementDate: string) => {
    const billed = total("EXPENSE", statementDate) - total("CARD_PAYMENT", statementDate);
    const paidSince = total("CARD_PAYMENT") - total("CARD_PAYMENT", statementDate);
    return Math.max(round2(billed - paidSince), 0);
  };

  const statementDate = lastStatementDate(statementDay, todayKey);
  const dueDate = dueDateFor(statementDate, dueDay);
  const dueAmount = dueOn(statementDate);
  const notYetBilled = Math.max(round2(owed - dueAmount), 0);

  let overdue: CardDue["overdue"] = null;
  if (dueAmount > 0 && todayKey > dueDate) {
    overdue = { amount: dueAmount, since: dueDate };
  } else {
    // The bill before this one: its due date may have passed with money still unpaid.
    const prevStatement = previousStatementDate(statementDay, statementDate);
    const prevDue = dueDateFor(prevStatement, dueDay);
    const prevAmount = dueOn(prevStatement);
    if (prevAmount > 0 && todayKey > prevDue) overdue = { amount: prevAmount, since: prevDue };
  }

  return { owed, statementDate, dueDate, dueAmount, notYetBilled, overdue };
}

// ---- Owners: draws and the 15th / 30th payday ----

/** Paydays are the 15th and the 30th (the last day in February). */
const PAYDAY_DAYS = [15, 30];

const paydaysInMonth = (y: number, m: number) => PAYDAY_DAYS.map((d) => dateKey(y, m, clampDay(y, m, d)));

/** The latest payday date on or before today. */
export function paydayOnOrBefore(todayKey: string): string {
  const [y, m] = todayKey.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const all = [...paydaysInMonth(py, pm), ...paydaysInMonth(y, m)];
  return all.filter((d) => d <= todayKey).pop()!;
}

/** The first payday date strictly after the given date. */
export function paydayAfter(dateKeyIn: string): string {
  const [y, m] = dateKeyIn.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const all = [...paydaysInMonth(y, m), ...paydaysInMonth(ny, nm)];
  return all.find((d) => d > dateKeyIn)!;
}

/** The first payday date on or after the given date. */
export function paydayOnOrAfter(dateKeyIn: string): string {
  const [y, m] = dateKeyIn.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const all = [...paydaysInMonth(y, m), ...paydaysInMonth(ny, nm)];
  return all.find((d) => d >= dateKeyIn)!;
}

/** The earliest day money was received or spent: where the very first payday period begins. */
export function firstActivityDate(rows: FinanceRow[]): string | null {
  const days = live(rows)
    .filter((r) => r.kind === "INCOME" || r.kind === "EXPENSE")
    .map((r) => r.date)
    .sort();
  return days[0] ?? null;
}

/**
 * The payday being worked toward: the one after the last payday recorded; with none yet, the
 * first one on or after the first money recorded (today if nothing is recorded).
 */
export function upcomingPayday(lastPaydayKey: string | null, todayKey: string, firstActivityKey: string | null): string {
  return lastPaydayKey ? paydayAfter(lastPaydayKey) : paydayOnOrAfter(firstActivityKey ?? todayKey);
}

/**
 * The next payday to record: the upcoming one, once its date has come (so a missed payday is
 * done first, in order). Null while that date has not arrived.
 */
export function nextPaydayToRecord(
  lastPaydayKey: string | null,
  todayKey: string,
  firstActivityKey: string | null = null
): string | null {
  if (!lastPaydayKey && !firstActivityKey) return null;
  const next = upcomingPayday(lastPaydayKey, todayKey, firstActivityKey);
  return next <= todayKey ? next : null;
}

export interface PeriodProfit {
  /** First day counted (the day after the last payday, or the first recorded day). */
  start: string;
  end: string;
  received: number;
  spent: number;
  profit: number;
}

/** Money received minus money spent from the day after the last payday up to the payday. */
export function periodProfit(rows: FinanceRow[], lastPaydayKey: string | null, paydayKey: string): PeriodProfit {
  const inPeriod = live(rows).filter(
    (r) => (r.kind === "INCOME" || r.kind === "EXPENSE") && r.date <= paydayKey && (!lastPaydayKey || r.date > lastPaydayKey)
  );
  const sum = (kind: FinanceKindCode) => round2(inPeriod.filter((r) => r.kind === kind).reduce((t, r) => t + r.amount, 0));
  const received = sum("INCOME");
  const spent = sum("EXPENSE");
  const firstDay = inPeriod.map((r) => r.date).sort()[0];
  const start = lastPaydayKey ? addOneDay(lastPaydayKey) : (firstDay ?? paydayKey);
  return { start, end: paydayKey, received, spent, profit: round2(received - spent) };
}

function addOneDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return dateKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** What an owner is still owed: shares so far minus everything they have taken. Negative = taken ahead. */
export function ownerBalances(rows: FinanceRow[], ownerIds: string[]): Map<string, number> {
  const out = new Map<string, number>(ownerIds.map((id) => [id, 0]));
  for (const r of live(rows)) {
    if (!r.ownerId || !out.has(r.ownerId)) continue;
    if (r.kind === "OWNER_SHARE") out.set(r.ownerId, out.get(r.ownerId)! + r.amount);
    else if (r.kind === "OWNER_DRAW") out.set(r.ownerId, out.get(r.ownerId)! - r.amount);
  }
  for (const [id, v] of out) out.set(id, round2(v));
  return out;
}

export interface OwnerPayout {
  ownerId: string;
  /** The owner's percentage of the profit. */
  share: number;
  /** What they were owed (or had taken ahead) before this payday. */
  before: number;
  /** Cash paid out now: the share plus what was owed, never below zero. */
  payout: number;
  /** Still taken ahead after this payday (carried to the next one), as a positive number. */
  aheadAfter: number;
}

/**
 * Each owner gets the same percentage of the profit. Whatever an owner already took comes off
 * their payout; if they took more than their share, the rest carries to the next payday.
 * No profit means no share (a loss simply carries into the next period's profit).
 */
export function sharePlan(
  profit: number,
  percent: number,
  owners: { id: string; before: number }[]
): OwnerPayout[] {
  const share = profit > 0 ? round2((profit * percent) / 100) : 0;
  return owners.map((o) => {
    const net = round2(o.before + share);
    return {
      ownerId: o.id,
      share,
      before: o.before,
      payout: Math.max(net, 0),
      aheadAfter: Math.max(round2(-net), 0),
    };
  });
}

/** The biggest percentage that can be given to each of the owners (they can't add up past 100). */
export const maxPercentEach = (ownerCount: number) => (ownerCount > 0 ? Math.floor((10000 / ownerCount)) / 100 : 0);

// ---- Monthly bills ----

export interface BillStatus {
  /** When this month's bill is due. */
  dueDate: string;
  /** Days from today to the due date (negative once it has passed). */
  days: number;
  state: "recorded" | "overdue" | "dueSoon" | "later";
}

/** Where a monthly bill stands this month: already recorded, overdue, due within 3 days, or later. */
export function billStatus(dueDay: number, recordedThisMonth: boolean, todayKey: string): BillStatus {
  const [y, m] = todayKey.split("-").map(Number);
  const dueDate = dateKey(y, m, clampDay(y, m, dueDay));
  const days = daysBetween(todayKey, dueDate);
  const state = recordedThisMonth ? "recorded" : days < 0 ? "overdue" : days <= 3 ? "dueSoon" : "later";
  return { dueDate, days, state };
}

// ---- Checks before an entry is added or voided ----

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-15" as "Oct 15", for messages. */
export function shortDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** The day the starting balances were set (the earliest one), or null before they are. */
export function openingDate(rows: FinanceRow[]): string | null {
  const days = live(rows)
    .filter((r) => r.kind === "OPENING_BANK" || r.kind === "OPENING_CASH")
    .map((r) => r.date)
    .sort();
  return days[0] ?? null;
}

/**
 * Is this date allowed for a new entry? Nothing may be dated before the starting balances. And
 * once a payday has been paid out, money received or spent on or before it is closed: changing
 * it would change a profit the owners were already paid on. Returns the reason, or null.
 */
export function checkEntryDate(opts: {
  date: string;
  kind: FinanceKindCode;
  lastPaydayKey: string | null;
  openingKey: string | null;
}): string | null {
  const { date, kind, lastPaydayKey, openingKey } = opts;
  if ((kind === "INCOME" || kind === "EXPENSE") && lastPaydayKey && date <= lastPaydayKey) {
    return `That date is on or before the ${shortDate(lastPaydayKey)} payday, which was already paid out. Use a later date, or void that payday first.`;
  }
  if (openingKey && date < openingKey) {
    return `That date is before your starting balances (${shortDate(openingKey)}). Use ${shortDate(openingKey)} or later.`;
  }
  return null;
}

export interface BrokenBalance {
  what: "bank" | "cash" | "card";
  /** The balance (or amount owed) it would be left at. */
  after: number;
  cardId?: string;
}

/**
 * Would voiding this entry leave the bank or the production cash below zero (where it wasn't
 * made worse already), or a card with a negative balance (overpaid)? Returns what it would
 * break, or null if it's safe.
 */
export function wouldBreakBalances(rows: FinanceRow[], entryId: string): BrokenBalance | null {
  const entry = rows.find((r) => r.id === entryId);
  if (!entry) return null;
  const without = rows.map((r) => (r.id === entryId ? { ...r, voided: true } : r));
  const before = computeBalances(rows);
  const after = computeBalances(without);
  if (after.bank < -0.005 && after.bank < before.bank - 0.005) return { what: "bank", after: after.bank };
  if (after.cash < -0.005 && after.cash < before.cash - 0.005) return { what: "cash", after: after.cash };
  if (entry.cardId) {
    const owed = cardBalances(without, [entry.cardId])[0].owed;
    const was = cardBalances(rows, [entry.cardId])[0].owed;
    if (owed < -0.005 && owed < was - 0.005) return { what: "card", after: owed, cardId: entry.cardId };
  }
  return null;
}

/** An existing entry that looks the same as one about to be added (same day, amount, kind and category). */
export function findDuplicate(
  rows: FinanceRow[],
  cand: { kind: FinanceKindCode; date: string; amount: number; category: string | null; paidWith: PaidWithCode | null }
): FinanceRow | null {
  return (
    live(rows).find(
      (r) =>
        r.kind === cand.kind &&
        r.date === cand.date &&
        Math.abs(r.amount - cand.amount) < 0.005 &&
        (r.category ?? null) === (cand.category ?? null) &&
        (r.paidWith ?? null) === (cand.paidWith ?? null)
    ) ?? null
  );
}
