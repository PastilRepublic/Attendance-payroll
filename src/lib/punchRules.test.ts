import { describe, it, expect } from "vitest";
import {
  HHMM_PATTERN,
  findDuplicateOfLatest,
  isValidDeviceId,
  isRealDateKey,
  dayStateAfter,
  firstInvalidPunch,
  resolvePunchTime,
  validateDayEdit,
  MAX_OFFLINE_PUNCH_AGE_MS,
} from "./punchRules";
import type { PunchType } from "./payroll";

// Manila wall-clock time on 2026-10-05 as a UTC instant (Manila is UTC+8, no DST).
function at(hhmm: string): Date {
  return new Date(`2026-10-05T${hhmm}:00+08:00`);
}
function p(type: PunchType, hhmm: string) {
  return { type, timestamp: at(hhmm) };
}

describe("dayStateAfter", () => {
  it("allows only Time In before anything is punched", () => {
    expect(dayStateAfter([])).toEqual({ status: "OUT", allowedActions: ["IN"] });
  });

  it("offers Start Break or Time Out while working, and only Time Out once the break is used", () => {
    expect(dayStateAfter([p("IN", "08:00")]).allowedActions).toEqual(["BREAK_START", "OUT"]);
    expect(
      dayStateAfter([p("IN", "08:00"), p("BREAK_START", "12:00"), p("BREAK_END", "13:00")]).allowedActions
    ).toEqual(["OUT"]);
  });

  it("allows only End Break while on a break, and nothing after Time Out", () => {
    expect(dayStateAfter([p("IN", "08:00"), p("BREAK_START", "12:00")]).allowedActions).toEqual(["BREAK_END"]);
    expect(dayStateAfter([p("IN", "08:00"), p("OUT", "17:00")])).toEqual({ status: "DONE", allowedActions: [] });
  });

  it("goes by time order, not the order given", () => {
    expect(dayStateAfter([p("OUT", "17:00"), p("IN", "08:00")]).status).toBe("DONE");
  });
});

describe("firstInvalidPunch", () => {
  it("accepts a full day", () => {
    expect(
      firstInvalidPunch([p("IN", "08:00"), p("BREAK_START", "12:00"), p("BREAK_END", "13:00"), p("OUT", "17:00")])
    ).toBe(-1);
  });

  it("flags a second Time In (e.g. a double tap)", () => {
    expect(firstInvalidPunch([p("IN", "08:00"), p("IN", "08:00")])).toBe(1);
  });

  it("flags an offline Time Out landing before the day's Time In", () => {
    expect(firstInvalidPunch([p("OUT", "07:30"), p("IN", "08:00")])).toBe(0);
  });

  it("flags a Time Out straight from a break", () => {
    expect(firstInvalidPunch([p("IN", "08:00"), p("BREAK_START", "12:00"), p("OUT", "17:00")])).toBe(2);
  });
});

describe("resolvePunchTime", () => {
  const now = at("10:30");

  it("records a live punch now", () => {
    expect(resolvePunchTime(null, now)).toEqual({ ok: true, timestamp: now, backdated: false });
  });

  it("records an offline punch at the time it was made, not when it synced", () => {
    const queuedAt = at("08:00");
    expect(resolvePunchTime(queuedAt.toISOString(), now)).toEqual({
      ok: true,
      timestamp: queuedAt,
      backdated: true,
    });
  });

  it("caps a device clock running ahead at now", () => {
    expect(resolvePunchTime(at("11:00").toISOString(), now)).toEqual({ ok: true, timestamp: now, backdated: false });
  });

  it("falls back to now for an unreadable time", () => {
    expect(resolvePunchTime("not a date", now)).toEqual({ ok: true, timestamp: now, backdated: false });
  });

  it("rejects an offline punch older than the sync limit", () => {
    const old = new Date(now.getTime() - MAX_OFFLINE_PUNCH_AGE_MS - 60000);
    expect(resolvePunchTime(old.toISOString(), now)).toMatchObject({ ok: false, error: "OFFLINE_PUNCH_TOO_OLD" });
  });
});

describe("validateDayEdit", () => {
  const blank = { timeIn: "", breakStart: "", breakEnd: "", timeOut: "" };
  const past = (t: Partial<typeof blank>) => validateDayEdit({ ...blank, ...t }, "2026-10-04", "2026-10-05", "10:00");

  it("accepts a full day, a day without a break, a half day, and an empty day", () => {
    expect(past({ timeIn: "08:00", breakStart: "12:00", breakEnd: "13:00", timeOut: "17:00" })).toBeNull();
    expect(past({ timeIn: "08:00", timeOut: "17:00" })).toBeNull();
    expect(past({ timeIn: "08:00", breakStart: "12:00" })).toBeNull();
    expect(past({})).toBeNull();
  });

  it("rejects times out of order", () => {
    expect(past({ timeIn: "09:00", timeOut: "08:00" })).toMatch(/in order/);
  });

  it("rejects a Time Out or Start Break without a Time In", () => {
    expect(past({ timeOut: "17:00" })).toMatch(/Time Out needs a Time In/);
    expect(past({ breakStart: "12:00" })).toMatch(/needs a Time In/);
  });

  it("rejects an End Break without a Start Break", () => {
    expect(past({ timeIn: "08:00", breakEnd: "13:00", timeOut: "17:00" })).toMatch(/needs a Start Break/);
  });

  it("rejects a Time Out after a break that never ended", () => {
    expect(past({ timeIn: "08:00", breakStart: "12:00", timeOut: "17:00" })).toMatch(/needs an End Break/);
  });

  it("rejects times later than now today, and any times on a future date", () => {
    expect(validateDayEdit({ ...blank, timeIn: "08:00", timeOut: "17:00" }, "2026-10-05", "2026-10-05", "10:00")).toMatch(
      /Time Out \(17:00\) is later than the current time/
    );
    expect(validateDayEdit({ ...blank, timeIn: "08:00" }, "2026-10-05", "2026-10-05", "10:00")).toBeNull();
    expect(validateDayEdit({ ...blank, timeIn: "08:00" }, "2026-10-06", "2026-10-05", "10:00")).toMatch(/future date/);
  });
});

describe("HHMM_PATTERN and isRealDateKey", () => {
  it("accepts real 24-hour times only", () => {
    for (const ok of ["00:00", "08:05", "23:59"]) expect(HHMM_PATTERN.test(ok)).toBe(true);
    for (const bad of ["24:00", "99:99", "8:05", "12:60", "12:5", ""]) expect(HHMM_PATTERN.test(bad)).toBe(false);
  });

  it("accepts real calendar dates only", () => {
    expect(isRealDateKey("2026-02-28")).toBe(true);
    expect(isRealDateKey("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-31", "2026-13-01", "2026-00-10", "2026-1-1", "garbage"]) {
      expect(isRealDateKey(bad)).toBe(false);
    }
  });
});

describe("offline retry helpers", () => {
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 0, 5, h, m));

  it("caps how old an offline punch can be at 24 hours", () => {
    expect(MAX_OFFLINE_PUNCH_AGE_MS).toBe(24 * 60 * 60 * 1000);
    const now = new Date("2026-01-06T10:00:00Z");
    expect(resolvePunchTime(new Date(now.getTime() - 23 * 3600_000).toISOString(), now)).toMatchObject({ ok: true });
    expect(resolvePunchTime(new Date(now.getTime() - 25 * 3600_000).toISOString(), now)).toMatchObject({ ok: false });
  });

  it("only accepts UUID-like device ids", () => {
    expect(isValidDeviceId("3f2b8c1e-9d4a-4b7e-8a11-0c5d6e7f8a90")).toBe(true);
    for (const bad of ["", "short", "x".repeat(65), "has space in it", null, 42, "<script>alert(1)</script>"]) {
      expect(isValidDeviceId(bad)).toBe(false);
    }
  });

  it("treats a retried punch as the same punch only when it repeats the latest one shortly after", () => {
    const before = [
      { type: "IN" as const, timestamp: at(0, 0) },
      { type: "BREAK_START" as const, timestamp: at(4, 0) },
    ];
    expect(findDuplicateOfLatest(before, "BREAK_START", at(4, 2))).toBe(before[1]);
    expect(findDuplicateOfLatest(before, "BREAK_START", at(4, 30))).toBeNull(); // too long after
    expect(findDuplicateOfLatest(before, "IN", at(4, 2))).toBeNull(); // not the latest type
    expect(findDuplicateOfLatest([], "IN", at(4, 2))).toBeNull();
  });
});
