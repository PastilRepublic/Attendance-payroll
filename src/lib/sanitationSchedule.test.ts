import { describe, expect, it } from "vitest";
import {
  addDays,
  datesInMonth,
  isMonthlyDue,
  isWeeklyDue,
  isoWeekday,
  lastWeekdayOfMonth,
  monthlyCleaningDateFor,
  nextMonthlyDate,
  nextWeeklyDate,
  reminderDateFor,
  reminderPhase,
} from "./sanitationSchedule";

const SATURDAY = 6;

describe("sanitation schedule dates", () => {
  it("finds the ISO weekday", () => {
    expect(isoWeekday("2026-09-20")).toBe(7); // Sunday
    expect(isoWeekday("2026-09-26")).toBe(6); // Saturday
  });

  it("finds the last Saturday of a month", () => {
    expect(lastWeekdayOfMonth(2026, 9, SATURDAY)).toBe("2026-09-26");
    expect(lastWeekdayOfMonth(2026, 10, SATURDAY)).toBe("2026-10-31");
    expect(lastWeekdayOfMonth(2026, 2, SATURDAY)).toBe("2026-02-28");
  });

  it("uses the override only inside its own month", () => {
    expect(monthlyCleaningDateFor("2026-09-10", SATURDAY, "2026-09-19")).toBe("2026-09-19");
    expect(monthlyCleaningDateFor("2026-10-10", SATURDAY, "2026-09-19")).toBe("2026-10-31");
    expect(monthlyCleaningDateFor("2026-09-10", SATURDAY, null)).toBe("2026-09-26");
  });

  it("knows when weekly and monthly duties are due", () => {
    expect(isWeeklyDue("2026-09-26", SATURDAY)).toBe(true);
    expect(isWeeklyDue("2026-09-25", SATURDAY)).toBe(false);
    expect(isMonthlyDue("2026-09-26", SATURDAY, null)).toBe(true);
    expect(isMonthlyDue("2026-09-19", SATURDAY, null)).toBe(false);
    expect(isMonthlyDue("2026-09-19", SATURDAY, "2026-09-19")).toBe(true);
  });

  it("finds the next weekly date, counting today", () => {
    expect(nextWeeklyDate("2026-09-26", SATURDAY)).toBe("2026-09-26");
    expect(nextWeeklyDate("2026-09-27", SATURDAY)).toBe("2026-10-03");
    expect(nextWeeklyDate("2026-09-20", SATURDAY)).toBe("2026-09-26");
  });

  it("rolls the next monthly date into the following month once passed", () => {
    expect(nextMonthlyDate("2026-09-20", SATURDAY, null)).toBe("2026-09-26");
    expect(nextMonthlyDate("2026-09-26", SATURDAY, null)).toBe("2026-09-26");
    expect(nextMonthlyDate("2026-09-27", SATURDAY, null)).toBe("2026-10-31");
    expect(nextMonthlyDate("2026-12-30", SATURDAY, null)).toBe("2027-01-30");
  });

  it("starts reminders two days before and flags the due day", () => {
    expect(reminderDateFor("2026-09-26")).toBe("2026-09-24");
    expect(reminderPhase("2026-09-23", "2026-09-26")).toBe("later");
    expect(reminderPhase("2026-09-24", "2026-09-26")).toBe("coming-up");
    expect(reminderPhase("2026-09-26", "2026-09-26")).toBe("due-today");
  });

  it("adds days across month boundaries and lists a month's dates", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(datesInMonth("2026-02-10")).toHaveLength(28);
    expect(datesInMonth("2026-09-10")[29]).toBe("2026-09-30");
  });
});
