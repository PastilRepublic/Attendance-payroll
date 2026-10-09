import { describe, it, expect } from "vitest";
import { currentMonthKey, isMonthKey, monthLabel, monthRange, nextPeriodToCreate } from "./payPeriods";

// Oct 8, 2026 is a Thursday (Manila).
const THU = new Date("2026-10-08T05:00:00Z");

describe("nextPeriodToCreate", () => {
  it("offers the week after the latest one once it has started", () => {
    // Latest period ended Sun Sep 27, so the next is Sep 28 - Oct 4, which has started.
    const next = nextPeriodToCreate(new Date("2026-09-27T00:00:00Z"), THU);
    expect(next).toEqual({ start: "2026-09-28", end: "2026-10-04", canCreate: true });
  });

  it("lets you catch up one week at a time when behind", () => {
    const next = nextPeriodToCreate(new Date("2026-10-04T00:00:00Z"), THU);
    expect(next).toEqual({ start: "2026-10-05", end: "2026-10-11", canCreate: true });
  });

  it("does not offer a week that hasn't started yet", () => {
    // Latest is the current week (ends Oct 11); the next would start Oct 12 -- in the future.
    const next = nextPeriodToCreate(new Date("2026-10-11T00:00:00Z"), THU);
    expect(next).toEqual({ start: "2026-10-12", end: "2026-10-18", canCreate: false });
  });

  it("starts with the current week when there are no periods yet", () => {
    const next = nextPeriodToCreate(null, THU);
    expect(next).toEqual({ start: "2026-10-05", end: "2026-10-11", canCreate: true });
  });

  it("opens on the first day of the next week (Monday, Manila time)", () => {
    const monday = new Date("2026-10-11T17:00:00Z"); // Mon Oct 12, 01:00 in Manila
    expect(nextPeriodToCreate(new Date("2026-10-11T00:00:00Z"), monday).canCreate).toBe(true);
    const sundayNight = new Date("2026-10-11T15:00:00Z"); // Sun Oct 11, 23:00 in Manila
    expect(nextPeriodToCreate(new Date("2026-10-11T00:00:00Z"), sundayNight).canCreate).toBe(false);
  });
});

describe("month helpers", () => {
  it("knows the current month in Manila time", () => {
    expect(currentMonthKey(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11"); // Nov 1 in Manila
    expect(currentMonthKey(THU)).toBe("2026-10");
  });

  it("validates month keys", () => {
    for (const ok of ["2026-01", "2026-12"]) expect(isMonthKey(ok)).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-1", "26-10", "garbage", ""]) expect(isMonthKey(bad)).toBe(false);
  });

  it("covers the whole month, up to the 1st of the next", () => {
    const { from, to } = monthRange("2026-12");
    expect(from.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("writes the month for people", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});
