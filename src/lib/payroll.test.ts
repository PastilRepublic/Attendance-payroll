import { describe, it, expect } from "vitest";
import {
  computeDailyResults,
  summarizePeriod,
  computePay,
  computeDayBasedPay,
  localDateKey,
  type PayrollSettings,
  type OperationPayRates,
} from "./payroll";
import { resolveOperationDayForDate } from "./operationDay";

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

describe("computeDailyResults - early arrival before shift start", () => {
  it("does not earn extra regular/OT for time worked before shift start", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 7, 30), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    // Treated as if they started at 08:00 (shift start): 9h - 1h lunch = 8h net.
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.isLate).toBe(false);
  });

  it("still counts hours worked after shift end as OT, even with an early start", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 7, 30), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 18, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    // Clipped to 08:00-18:00 = 10h - 1h lunch = 9h net -> 8h regular + 1h OT
    // (the hour after the 17:00 shift end). The 07:30-08:00 head start earns nothing.
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(60);
    expect(day.isUndertime).toBe(false);
  });

  it("a late arrival is never clipped and is still flagged Late", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 20), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05"
    );
    expect(day.isLate).toBe(true);
  });
});

describe("computeDailyResults - shift override for one date", () => {
  it("uses the override start/end for Late/Undertime instead of the default", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 10, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 19, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-05",
      [{ date: "2026-01-05", shiftStartTime: "10:00", shiftEndTime: "19:00" }]
    );
    // Same 8-hour shift, just shifted two hours later -- not late, not undertime.
    expect(day.isLate).toBe(false);
    expect(day.isUndertime).toBe(false);
    expect(day.regularMinutes).toBe(8 * 60);
  });

  it("only applies to the overridden date, not other days in the same range", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 10, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 19, 0), type: "OUT" as const },
      { timestamp: atManila("2026-01-06", 10, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-06", 19, 0), type: "OUT" as const },
    ];
    const [day1, day2] = computeDailyResults(
      punches,
      [],
      settings,
      "2026-01-05",
      "2026-01-06",
      [{ date: "2026-01-05", shiftStartTime: "10:00", shiftEndTime: "19:00" }]
    );
    expect(day1.isLate).toBe(false);
    // Jan 6 has no override, so the default 08:00 shift start still applies.
    expect(day2.isLate).toBe(true);
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
  it("does not double-deduct lunch when the employee punches out/in for it", () => {
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
    // 4h + 4h = 8h worked. The 12:00-13:00 gap between the two segments IS
    // the lunch break, already excluded -- the flat unpaid-lunch minutes
    // must not also be subtracted on top of it.
    expect(day.workedMinutes).toBe(8 * 60);
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(0);
  });

  it("still deducts the flat unpaid lunch for a single continuous shift", () => {
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
    // 9h worked, no separate lunch punch -- minus 1h unpaid lunch = 8h net
    expect(day.workedMinutes).toBe(9 * 60);
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(0);
  });
});

describe("computeDailyResults - break punches", () => {
  it("excludes break time from worked minutes and does not also deduct the flat unpaid lunch", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 12, 0), type: "BREAK_START" as const },
      { timestamp: atManila("2026-01-05", 13, 0), type: "BREAK_END" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(punches, [], settings, "2026-01-05", "2026-01-05");
    // 4h + 4h = 8h worked, the 1h break already excluded -- no extra deduction on top.
    expect(day.workedMinutes).toBe(8 * 60);
    expect(day.regularMinutes).toBe(8 * 60);
    expect(day.overtimeMinutes).toBe(0);
    expect(day.returnedLateFromBreak).toBe(false);
  });

  it("flags returnedLateFromBreak when a break runs past the 60-minute allowance (strict, no grace)", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 12, 0), type: "BREAK_START" as const },
      { timestamp: atManila("2026-01-05", 13, 5), type: "BREAK_END" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(punches, [], settings, "2026-01-05", "2026-01-05");
    expect(day.returnedLateFromBreak).toBe(true);
  });

  it("does not flag returnedLateFromBreak when the break is under the 60-minute allowance", () => {
    const punches = [
      { timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const },
      { timestamp: atManila("2026-01-05", 12, 0), type: "BREAK_START" as const },
      { timestamp: atManila("2026-01-05", 12, 45), type: "BREAK_END" as const },
      { timestamp: atManila("2026-01-05", 17, 0), type: "OUT" as const },
    ];
    const [day] = computeDailyResults(punches, [], settings, "2026-01-05", "2026-01-05");
    expect(day.returnedLateFromBreak).toBe(false);
  });
});

describe("computePay", () => {
  it("HOURLY basis: pays regular hours only, OT hours are not auto-paid", () => {
    const result = computePay(40, "HOURLY", 100, {
      regularHoursCapPerDay: 8,
    });
    expect(result.hourlyRate).toBe(100);
    expect(result.basePay).toBe(4000);
    expect(result.grossPay).toBe(4000);
  });

  it("DAILY basis: a full 8h day earns exactly the daily rate", () => {
    const result = computePay(8, "DAILY", 800, {
      regularHoursCapPerDay: 8,
    });
    expect(result.hourlyRate).toBe(100);
    expect(result.basePay).toBe(800);
    expect(result.grossPay).toBe(800);
  });
});

describe("computeDayBasedPay", () => {
  const rates: OperationPayRates = { cooking: 400, jarFilling: 350 };
  // 2026-01-05 is a Monday (Cooking), 01-06 Tuesday (Jar Filling), 01-11 Sunday (Off).
  const overrides = new Map<string, "COOKING" | "JAR_FILLING">();
  const dayFor = (d: string) => resolveOperationDayForDate(d, overrides);

  const punchPair = (date: string, inH: number, outH: number) => [
    { timestamp: atManila(date, inH, 0), type: "IN" as const },
    { timestamp: atManila(date, outH, 0), type: "OUT" as const },
  ];
  const daysFor = (punches: ReturnType<typeof punchPair>, from: string, to: string) =>
    computeDailyResults(punches, [], settings, from, to);

  it("production: 400 for a cooking day, 350 for a jar filling day", () => {
    const days = daysFor(
      [...punchPair("2026-01-05", 8, 17), ...punchPair("2026-01-06", 8, 17)],
      "2026-01-05",
      "2026-01-06"
    );
    const pay = computeDayBasedPay(days, "OPERATION_DAY", 0, dayFor, rates);
    expect(pay.basePay).toBe(750);
    expect(pay.lines.map((l) => [l.label, l.days, l.amount])).toEqual([
      ["Cooking day", 1, 400],
      ["Jar filling day", 1, 350],
    ]);
  });

  it("production: a short day still earns the full rate (a Half day deduction is added by hand)", () => {
    const days = daysFor(punchPair("2026-01-05", 8, 12), "2026-01-05", "2026-01-05");
    expect(days[0].isUndertime).toBe(true);
    expect(computeDayBasedPay(days, "OPERATION_DAY", 0, dayFor, rates).basePay).toBe(400);
  });

  it("production: a recorded override changes the day's rate; Off days fall back to Jar Filling", () => {
    const days = daysFor(
      [...punchPair("2026-01-05", 8, 17), ...punchPair("2026-01-11", 8, 17)],
      "2026-01-05",
      "2026-01-11"
    );
    const swapped = new Map([["2026-01-05", "JAR_FILLING" as const]]);
    const pay = computeDayBasedPay(
      days,
      "OPERATION_DAY",
      0,
      (d) => resolveOperationDayForDate(d, swapped),
      rates
    );
    // Mon recorded as Jar Filling (350) + Sunday (Off) paid at the Jar Filling rate (350)
    expect(pay.basePay).toBe(700);
  });

  it("production: no punches or unpaid absence pays nothing; paid leave counts as worked", () => {
    const days = computeDailyResults(
      punchPair("2026-01-05", 8, 17),
      [
        { date: "2026-01-05", status: "UNPAID_ABSENCE" },
        { date: "2026-01-06", status: "PAID_LEAVE" },
      ],
      settings,
      "2026-01-05",
      "2026-01-07"
    );
    // Mon absent (0), Tue paid leave on a Jar Filling day (350), Wed nothing (0)
    expect(computeDayBasedPay(days, "OPERATION_DAY", 0, dayFor, rates).basePay).toBe(350);
  });

  it("flat daily: full rate for any worked day, even a short one, none for a day without punches", () => {
    const days = daysFor(
      [...punchPair("2026-01-11", 8, 11), ...punchPair("2026-01-05", 8, 17)],
      "2026-01-05",
      "2026-01-12"
    );
    const pay = computeDayBasedPay(days, "FLAT_DAILY", 600, dayFor, rates);
    expect(pay.basePay).toBe(1200); // Monday + a 3-hour Sunday, each the full 600
    expect(pay.lines).toEqual([{ label: "Day worked", days: 2, rate: 600, amount: 1200 }]);
  });

  it("flat daily: an open punch-in with no punch-out is not a worked day", () => {
    const days = daysFor(
      [{ timestamp: atManila("2026-01-05", 8, 0), type: "IN" as const }],
      "2026-01-05",
      "2026-01-05"
    );
    expect(computeDayBasedPay(days, "FLAT_DAILY", 600, dayFor, rates).basePay).toBe(0);
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

    const pay = computePay(regularHours, "HOURLY", 100, settings);
    // base = 38.6667 * 100 = 3866.67; OT is tracked (2h, asserted above) but not auto-paid
    expect(pay.basePay).toBeCloseTo(3866.6667, 2);
    expect(pay.grossPay).toBeCloseTo(3866.6667, 2);
  });
});
