import { describe, it, expect } from "vitest";
import {
  computeDailyResults,
  summarizePeriod,
  computePay,
  localDateKey,
  type PayrollSettings,
} from "./payroll";

const settings: PayrollSettings = {
  otMultiplier: 1.25,
  unpaidLunchMinutes: 60,
  regularHoursCapPerDay: 8,
  gracePeriodMinutes: 10,
  shiftStartTime: "08:00",
  shiftEndTime: "17:00",
};

// Build a UTC Date for a given Manila local wall-clock time (Manila is UTC+8, no DST).
function atManila(dateStr: string, hh: number, mm: number): Date {
  const iso = `${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+08:00`;
  return new Date(iso);
}

describe("localDateKey", () => {
  it("resolves a UTC instant to its Asia/Manila calendar date", () => {
    // 2026-01-05 23:30 UTC = 2026-01-06 07:30 Manila
    expect(localDateKey(new Date("2026-01-05T23:30:00.000Z"))).toBe(
      "2026-01-06"
    );
  });
});

describe("computeDailyResults - exact cap day", () => {
  it("in 08:00, out 17:00 => 8 regular hours, no OT, not late, not undertime", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.isLate).toBe(false);
    expect(day.isUndertime).toBe(false);
  });
});

describe("computeDailyResults - overtime day", () => {
  it("in 08:00, out 19:00 => 8 regular + 2 OT hours", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 19, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    // gross 11h - 1h unpaid lunch = 10h net; 8 regular, 2 OT
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(2 * 60);
  });
});

describe("computeDailyResults - late + undertime day", () => {
  it("in 08:20 (past grace), out 16:00 (before shift end) => flagged, reduced hours", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 20), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 16, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    expect(day.isLate).toBe(true);
    expect(day.isUndertime).toBe(true);
    // gross 7h40m - 1h lunch = 6h40m = 400 min, all regular (under cap)
    expect(day.regularMinutes).toBe(400);
    expect(day.overtimeMinutes).toBe(0);
  });

  it("in 08:05 (within grace) is not late", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 5), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    expect(day.isLate).toBe(false);
  });
});

describe("computeDailyResults - paid leave day", () => {
  it("credits a full regular day regardless of punches", () => {
    const [day] = computeDailyResults(
      [],
      [{ date: "2026-01-05", status: "PAID_LEAVE" }],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.isLate).toBe(false);
    expect(day.isUndertime).toBe(false);
  });
});

describe("computeDailyResults - unpaid absence day", () => {
  it("zeroes pay regardless of punches", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [{ date: "2026-01-05", status: "UNPAID_ABSENCE" }],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    expect(day.regularMinutes).toBe(0);
    expect(day.overtimeMinutes).toBe(0);
  });
});

describe("computeDailyResults - multiple punch pairs in one day", () => {
  it("sums worked minutes across pairs (e.g. a mid-day errand)", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 12, 0), type: "OUT" as const },
      { timestamp: atManila("2026-01-05", 13, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    // 4h + 4h = 8h worked, minus 1h unpaid lunch = 7h net (all regular)
    expect(day.workedMinutes).toBe(8 * 60);
    expect(day.regularMinutes).toBe(7 * 60);
    expect(day.overtimeMinutes).toBe(0);
  });
});

describe("computePay", () => {
  it("HOURLY basis: regular + OT at multiplier", () => {
    const result = computePay(40, 5, "HOURLY", 100, {
      otMultiplier: 1.25,
      regularHoursCapPerDay: 8,
    });
    expect(result.hourlyRate).toBe(100);
    expect(result.basePay).toBe(4000);
    expect(result.overtimePay).toBe(625); // 5 * 100 * 1.25
    expect(result.grossPay).toBe(4625);
  });

  it("DAILY basis: a full 8h day earns exactly the daily rate", () => {
    const result = computePay(8, 0, "DAILY", 800, {
      otMultiplier: 1.25,
      regularHoursCapPerDay: 8,
    });
    expect(result.hourlyRate).toBe(100);
    expect(result.basePay).toBe(800);
    expect(result.grossPay).toBe(800);
  });
});

describe("full period integration - hand-calculable example", () => {
  it("Mon-Fri normal weeks + 1 OT day + 1 late/undertime day + weekend absence, HOURLY $100/hr", () => {
    const punches = [
      // Mon: exact 8h
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
      // Tue: 2h OT
      { timestamp: atManila("2026-01-06", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-06", 19, 0), type: "OUT" as const },
      // Wed: late + undertime, 6h40m net
      { timestamp: atManila("2026-01-07", 8, 20), type: "IN" as const },
      { timestamp: atManila("2026-01-07", 16, 0), type: "OUT" as const },
      // Thu: exact 8h
      { timestamp: atManila("2026-01-08", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-08", 17, 0), type: "OUT" as const },
      // Fri: exact 8h
      { timestamp: atManila("2026-01-09", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-09", 17, 0), type: "OUT" as const },
      // Sat/Sun: no punches (unmarked = 0 hours, not absence-flagged)
    ];

    const days = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-11"
    );
    const { regularHours, overtimeHours } = summarizePeriod(days);

    // Regular: Mon 8 + Tue 8(capped) + Wed 6h40m + Thu 8 + Fri 8 = 38h40m = 38.6667h
    expect(regularHours).toBeCloseTo(38 + 40 / 60, 5);
    // OT: Tue 2h only
    expect(overtimeHours).toBeCloseTo(2, 5);

    const pay = computePay(regularHours, overtimeHours, "HOURLY", 100, settings);
    // base = 38.6667 * 100 = 3866.67; OT = 2 * 100 * 1.25 = 250; gross = 4116.67
    expect(pay.basePay).toBeCloseTo(3866.6667, 2);
    expect(pay.overtimePay).toBeCloseTo(250, 5);
    expect(pay.grossPay).toBeCloseTo(4116.6667, 2);
  });
});
