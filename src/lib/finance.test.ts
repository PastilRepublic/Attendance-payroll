import { describe, it, expect } from "vitest";
import {
  cardBalances,
  cashLog,
  computeBalances,
  cardDue,
  dueDateFor,
  daysBetween,
  lastStatementDate,
  nextDueDate,
  summarizeMonth,
  type FinanceRow,
} from "./finance";

let n = 0;
const row = (over: Partial<FinanceRow> & Pick<FinanceRow, "kind" | "amount">): FinanceRow => ({
  id: `r${++n}`,
  date: "2026-10-01",
  category: null,
  paidWith: null,
  cardId: null,
  voided: false,
  createdAt: n,
  ...over,
});

describe("computeBalances", () => {
  it("moves cash out of the bank on a withdrawal without counting it as spent", () => {
    const rows = [
      row({ kind: "OPENING_BANK", amount: 200000 }),
      row({ kind: "CASH_WITHDRAWAL", amount: 50000 }),
    ];
    expect(computeBalances(rows)).toEqual({ bank: 150000, cash: 50000, total: 200000 });
  });

  it("takes a cash expense off the cash only, not the bank again", () => {
    const rows = [
      row({ kind: "OPENING_BANK", amount: 200000 }),
      row({ kind: "CASH_WITHDRAWAL", amount: 50000 }),
      row({ kind: "EXPENSE", amount: 41200, category: "CHICKEN", paidWith: "CASH" }),
    ];
    expect(computeBalances(rows)).toEqual({ bank: 150000, cash: 8800, total: 158800 });
  });

  it("takes a bank expense off the bank and adds money received to it", () => {
    const rows = [
      row({ kind: "OPENING_BANK", amount: 10000 }),
      row({ kind: "INCOME", amount: 5000, category: "SHOPEE" }),
      row({ kind: "EXPENSE", amount: 3000, category: "RENT", paidWith: "BANK" }),
    ];
    expect(computeBalances(rows)).toEqual({ bank: 12000, cash: 0, total: 12000 });
  });

  it("ignores voided lines and counts starting cash", () => {
    const rows = [
      row({ kind: "OPENING_CASH", amount: 1000 }),
      row({ kind: "EXPENSE", amount: 400, category: "GAS", paidWith: "CASH", voided: true }),
      row({ kind: "EXPENSE", amount: 100, category: "GAS", paidWith: "CASH" }),
    ];
    expect(computeBalances(rows).cash).toBe(900);
  });

  it("can show cash below zero when a withdrawal was never recorded", () => {
    const rows = [row({ kind: "EXPENSE", amount: 500, category: "OIL", paidWith: "CASH" })];
    expect(computeBalances(rows).cash).toBe(-500);
  });

  it("does not drift on cents", () => {
    const rows = [
      row({ kind: "OPENING_BANK", amount: 0.1 }),
      row({ kind: "INCOME", amount: 0.2, category: "DIRECT" }),
    ];
    expect(computeBalances(rows).bank).toBe(0.3);
  });
});

describe("credit cards", () => {
  it("adds a card expense to what is owed and leaves the bank and cash alone", () => {
    const rows = [
      row({ kind: "OPENING_BANK", amount: 100000 }),
      row({ kind: "EXPENSE", amount: 12000, category: "ADVERTISING", paidWith: "CARD", cardId: "c1" }),
    ];
    expect(computeBalances(rows)).toEqual({ bank: 100000, cash: 0, total: 100000 });
    expect(cardBalances(rows, ["c1"])).toEqual([{ cardId: "c1", owed: 12000 }]);
  });

  it("takes a card payment off both the bank and what is owed", () => {
    const rows = [
      row({ kind: "OPENING_BANK", amount: 100000 }),
      row({ kind: "EXPENSE", amount: 12000, category: "ADVERTISING", paidWith: "CARD", cardId: "c1" }),
      row({ kind: "CARD_PAYMENT", amount: 5000, cardId: "c1" }),
    ];
    expect(computeBalances(rows).bank).toBe(95000);
    expect(cardBalances(rows, ["c1"])[0].owed).toBe(7000);
  });

  it("keeps cards apart and ignores voided lines", () => {
    const rows = [
      row({ kind: "EXPENSE", amount: 300, category: "GAS", paidWith: "CARD", cardId: "c1" }),
      row({ kind: "EXPENSE", amount: 200, category: "GAS", paidWith: "CARD", cardId: "c2" }),
      row({ kind: "EXPENSE", amount: 999, category: "GAS", paidWith: "CARD", cardId: "c2", voided: true }),
    ];
    expect(cardBalances(rows, ["c1", "c2"])).toEqual([
      { cardId: "c1", owed: 300 },
      { cardId: "c2", owed: 200 },
    ]);
  });

  it("counts a card expense as money spent in the month, but a card payment is not spending", () => {
    const rows = [
      row({ kind: "INCOME", amount: 10000, category: "TIKTOK", date: "2026-10-03" }),
      row({ kind: "EXPENSE", amount: 4000, category: "ADVERTISING", paidWith: "CARD", cardId: "c1", date: "2026-10-04" }),
      row({ kind: "CARD_PAYMENT", amount: 4000, cardId: "c1", date: "2026-10-20" }),
    ];
    const s = summarizeMonth(rows, "2026-10");
    expect(s.spent).toBe(4000);
    expect(s.profit).toBe(6000);
  });
});

describe("due dates", () => {
  it("is this month's due day if it has not passed, today included", () => {
    expect(nextDueDate(25, "2026-10-10")).toBe("2026-10-25");
    expect(nextDueDate(10, "2026-10-10")).toBe("2026-10-10");
  });

  it("is next month's once this month's has passed, including over the year end", () => {
    expect(nextDueDate(5, "2026-10-10")).toBe("2026-11-05");
    expect(nextDueDate(5, "2026-12-10")).toBe("2027-01-05");
  });

  it("uses the last day of a short month for a due day of 29 to 31", () => {
    expect(nextDueDate(31, "2026-02-10")).toBe("2026-02-28");
    expect(nextDueDate(30, "2026-01-31")).toBe("2026-02-28");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-10", "2026-10-13")).toBe(3);
    expect(daysBetween("2026-10-10", "2026-10-10")).toBe(0);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("card statements (statement on the 17th, due on the 5th)", () => {
  const charge = (amount: number, date: string, cardId = "c1") =>
    row({ kind: "EXPENSE", amount, category: "ADVERTISING", paidWith: "CARD", cardId, date });
  const payment = (amount: number, date: string, cardId = "c1") => row({ kind: "CARD_PAYMENT", amount, cardId, date });

  it("finds the latest statement date and when its bill is due", () => {
    expect(lastStatementDate(17, "2026-10-20")).toBe("2026-10-17");
    expect(lastStatementDate(17, "2026-10-17")).toBe("2026-10-17");
    expect(lastStatementDate(17, "2026-10-16")).toBe("2026-09-17");
    expect(lastStatementDate(17, "2026-01-05")).toBe("2025-12-17");
    expect(lastStatementDate(31, "2026-03-10")).toBe("2026-02-28");
    expect(dueDateFor("2026-10-17", 5)).toBe("2026-11-05");
    expect(dueDateFor("2026-10-17", 25)).toBe("2026-10-25");
    expect(dueDateFor("2026-12-17", 5)).toBe("2027-01-05");
  });

  it("separates what is due on the bill from what is charged after the statement date", () => {
    // Charges up to Oct 17 are on the bill; the ones from Oct 18 are not.
    const rows = [charge(20000, "2026-10-03"), charge(12400, "2026-10-17"), charge(5000, "2026-10-18"), charge(3000, "2026-10-25")];
    const c = cardDue(rows, "c1", 17, 5, "2026-10-31");
    expect(c.statementDate).toBe("2026-10-17");
    expect(c.dueDate).toBe("2026-11-05");
    expect(c.dueAmount).toBe(32400);
    expect(c.notYetBilled).toBe(8000);
    expect(c.owed).toBe(40400);
    expect(c.overdue).toBeNull();
  });

  it("after paying the bill, only the unbilled charges are left and nothing is due", () => {
    const rows = [charge(32400, "2026-10-10"), charge(8000, "2026-10-20"), payment(32400, "2026-11-05")];
    const c = cardDue(rows, "c1", 17, 5, "2026-11-06");
    expect(c.dueAmount).toBe(0);
    expect(c.notYetBilled).toBe(8000);
    expect(c.owed).toBe(8000);
    expect(c.overdue).toBeNull();
  });

  it("moves the unbilled charges onto the bill once the next statement date passes", () => {
    const rows = [charge(32400, "2026-10-10"), charge(8000, "2026-10-20"), payment(32400, "2026-11-05"), charge(1000, "2026-11-10")];
    const c = cardDue(rows, "c1", 17, 5, "2026-11-18");
    expect(c.statementDate).toBe("2026-11-17");
    expect(c.dueAmount).toBe(9000);
    expect(c.dueDate).toBe("2026-12-05");
  });

  it("only counts what is still unpaid after a part payment", () => {
    const rows = [charge(32400, "2026-10-10"), payment(20000, "2026-11-01")];
    const c = cardDue(rows, "c1", 17, 5, "2026-11-02");
    expect(c.dueAmount).toBe(12400);
  });

  it("flags a bill that is past its due date and still unpaid", () => {
    const rows = [charge(32400, "2026-10-10")];
    expect(cardDue(rows, "c1", 17, 5, "2026-11-05").overdue).toBeNull(); // due today is not late yet
    expect(cardDue(rows, "c1", 17, 5, "2026-11-08").overdue).toEqual({ amount: 32400, since: "2026-11-05" });
  });

  it("still flags the previous bill after a new statement has been printed", () => {
    const rows = [charge(32400, "2026-10-10"), charge(500, "2026-11-01")];
    const c = cardDue(rows, "c1", 17, 5, "2026-11-20");
    expect(c.overdue).toEqual({ amount: 32400, since: "2026-11-05" });
  });

  it("keeps cards separate and ignores voided lines", () => {
    const rows = [charge(1000, "2026-10-01", "c1"), charge(2000, "2026-10-01", "c2"), { ...charge(5000, "2026-10-02", "c1"), voided: true }];
    expect(cardDue(rows, "c1", 17, 5, "2026-10-20").dueAmount).toBe(1000);
    expect(cardDue(rows, "c2", 17, 5, "2026-10-20").dueAmount).toBe(2000);
  });
});

describe("summarizeMonth", () => {
  const rows = [
    row({ kind: "OPENING_BANK", amount: 99999, date: "2026-10-01" }),
    row({ kind: "INCOME", amount: 10000, category: "SHOPEE", date: "2026-10-05" }),
    row({ kind: "INCOME", amount: 4000, category: "TIKTOK", date: "2026-10-06" }),
    row({ kind: "INCOME", amount: 777, category: "SHOPEE", date: "2026-09-30" }),
    row({ kind: "CASH_WITHDRAWAL", amount: 5000, date: "2026-10-07" }),
    row({ kind: "EXPENSE", amount: 3000, category: "CHICKEN", paidWith: "CASH", date: "2026-10-08" }),
    row({ kind: "EXPENSE", amount: 1000, category: "OIL", paidWith: "CASH", date: "2026-10-08" }),
    row({ kind: "EXPENSE", amount: 9999, category: "GAS", paidWith: "CASH", date: "2026-10-08", voided: true }),
  ];

  it("adds up money in and out for the month, leaving out starting balances, withdrawals and voids", () => {
    const s = summarizeMonth(rows, "2026-10");
    expect(s.received).toBe(14000);
    expect(s.spent).toBe(4000);
    expect(s.profit).toBe(10000);
    expect(s.withdrawn).toBe(5000);
  });

  it("breaks money in by channel and spending by category, biggest first", () => {
    const s = summarizeMonth(rows, "2026-10");
    expect(s.byChannel.map((c) => [c.code, c.amount])).toEqual([
      ["SHOPEE", 10000],
      ["TIKTOK", 4000],
    ]);
    expect(s.byCategory.map((c) => [c.code, c.amount])).toEqual([
      ["CHICKEN", 3000],
      ["OIL", 1000],
    ]);
  });

  it("keeps a category that is no longer in the list so no money goes missing", () => {
    const s = summarizeMonth([row({ kind: "EXPENSE", amount: 50, category: "OLD", paidWith: "BANK", date: "2026-10-02" })], "2026-10");
    expect(s.byCategory).toEqual([{ code: "OLD", label: "OLD", amount: 50 }]);
  });
});

describe("cashLog", () => {
  it("reads straight down: taken, spent, left", () => {
    const rows = [
      row({ kind: "CASH_WITHDRAWAL", amount: 50000, date: "2026-10-01" }),
      row({ kind: "EXPENSE", amount: 18000, category: "CHICKEN", paidWith: "CASH", date: "2026-10-01" }),
      row({ kind: "EXPENSE", amount: 6500, category: "OIL", paidWith: "CASH", date: "2026-10-02" }),
      row({ kind: "EXPENSE", amount: 999, category: "RENT", paidWith: "BANK", date: "2026-10-02" }),
    ];
    const log = cashLog(rows);
    expect(log.map((l) => l.balanceAfter)).toEqual([50000, 32000, 25500]);
    expect(log.map((l) => l.change)).toEqual([50000, -18000, -6500]);
  });

  it("leaves out a starting cash of zero", () => {
    const rows = [
      row({ kind: "OPENING_CASH", amount: 0 }),
      row({ kind: "CASH_WITHDRAWAL", amount: 500, date: "2026-10-02" }),
    ];
    expect(cashLog(rows).map((l) => l.kind)).toEqual(["CASH_WITHDRAWAL"]);
  });

  it("puts same-day lines in the order they were entered and skips voids", () => {
    const rows = [
      row({ kind: "EXPENSE", amount: 100, category: "GAS", paidWith: "CASH", date: "2026-10-03", createdAt: 5 }),
      row({ kind: "CASH_WITHDRAWAL", amount: 1000, date: "2026-10-03", createdAt: 2 }),
      row({ kind: "EXPENSE", amount: 300, category: "GAS", paidWith: "CASH", date: "2026-10-03", createdAt: 9, voided: true }),
    ];
    expect(cashLog(rows).map((l) => l.balanceAfter)).toEqual([1000, 900]);
  });
});
