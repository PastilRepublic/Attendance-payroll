import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, eachDayOfInterval, parseISO } from "date-fns";

export const TIMEZONE = "Asia/Manila";

export type PunchType = "IN" | "OUT";
export type PayBasis = "HOURLY" | "DAILY";
export type DayStatusType = "PAID_LEAVE" | "UNPAID_ABSENCE";

export interface PunchInput {
  timestamp: Date;
  type: PunchType;
}

export interface DayStatusInput {
  /** Local (Asia/Manila) calendar date, YYYY-MM-DD */
  date: string;
  status: DayStatusType;
}

export interface PayrollSettings {
  otMultiplier: number;
  unpaidLunchMinutes: number;
  regularHoursCapPerDay: number;
  gracePeriodMinutes: number;
  /** "HH:mm" in Asia/Manila local time */
  shiftStartTime: string;
  /** "HH:mm" in Asia/Manila local time */
  shiftEndTime: string;
}

export interface DailyResult {
  date: string;
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  isLate: boolean;
  isUndertime: boolean;
  dayStatus: DayStatusType | null;
}

export interface PeriodResult {
  days: DailyResult[];
  regularHours: number;
  overtimeHours: number;
}

export interface PayResult {
  hourlyRate: number;
  basePay: number;
  overtimePay: number;
  grossPay: number;
}

/** Local (Asia/Manila) calendar date string, YYYY-MM-DD, for a UTC instant. */
export function localDateKey(instant: Date): string {
  return formatInTimeZone(instant, TIMEZONE, "yyyy-MM-dd");
}

function localMinutesOfDay(instant: Date): number {
  const zoned = toZonedTime(instant, TIMEZONE);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

function parseHHmm(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Pairs sequential IN/OUT punches (sorted ascending) into worked minutes for
 * one day, and counts how many IN->OUT segments were closed. A normal day
 * has one segment (a single continuous shift, lunch not punched separately).
 * An actual lunch-break punch-out/punch-in produces a second segment, whose
 * gap already excludes the break -- so the flat unpaid-lunch deduction
 * should not also apply on top of it (see computeDailyResults below).
 */
function pairPunches(punches: PunchInput[]): { workedMinutes: number; segments: number } {
  const sorted = [...punches].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  let workedMs = 0;
  let segments = 0;
  let openIn: Date | null = null;
  for (const p of sorted) {
    if (p.type === "IN") {
      openIn = p.timestamp;
    } else if (p.type === "OUT" && openIn) {
      workedMs += p.timestamp.getTime() - openIn.getTime();
      segments += 1;
      openIn = null;
    }
  }
  return { workedMinutes: workedMs / 60000, segments };
}

/**
 * Computes per-day regular/overtime minutes and late/undertime flags for every
 * local calendar day in [periodStartDate, periodEndDate] (inclusive, YYYY-MM-DD).
 */
export interface ShiftOverrideInput {
  /** Local (Asia/Manila) calendar date, YYYY-MM-DD */
  date: string;
  /** "HH:mm" in Asia/Manila local time */
  shiftStartTime: string;
  /** "HH:mm" in Asia/Manila local time */
  shiftEndTime: string;
}

export function computeDailyResults(
  punches: PunchInput[],
  dayStatuses: DayStatusInput[],
  settings: PayrollSettings,
  periodStartDate: string,
  periodEndDate: string,
  shiftOverrides: ShiftOverrideInput[] = []
): DailyResult[] {
  const punchesByDay = new Map<string, PunchInput[]>();
  for (const p of punches) {
    const key = localDateKey(p.timestamp);
    if (!punchesByDay.has(key)) punchesByDay.set(key, []);
    punchesByDay.get(key)!.push(p);
  }

  const statusByDay = new Map<string, DayStatusType>();
  for (const s of dayStatuses) statusByDay.set(s.date, s.status);

  const overrideByDay = new Map<string, ShiftOverrideInput>();
  for (const o of shiftOverrides) overrideByDay.set(o.date, o);

  const capMinutes = settings.regularHoursCapPerDay * 60;

  const days = eachDayOfInterval({
    start: parseISO(periodStartDate),
    end: parseISO(periodEndDate),
  }).map((d) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd"));

  return days.map((date) => {
    const dayPunches = punchesByDay.get(date) ?? [];
    const dayStatus = statusByDay.get(date) ?? null;
    const { workedMinutes, segments } = pairPunches(dayPunches);

    if (dayStatus === "PAID_LEAVE") {
      return {
        date,
        workedMinutes,
        regularMinutes: capMinutes,
        overtimeMinutes: 0,
        isLate: false,
        isUndertime: false,
        dayStatus,
      };
    }
    if (dayStatus === "UNPAID_ABSENCE") {
      return {
        date,
        workedMinutes,
        regularMinutes: 0,
        overtimeMinutes: 0,
        isLate: false,
        isUndertime: false,
        dayStatus,
      };
    }

    // A second (or later) segment means the employee actually punched out and
    // back in for lunch -- that gap is already excluded from workedMinutes,
    // so don't also subtract the flat unpaid-lunch minutes on top of it.
    const netMinutes =
      segments >= 2
        ? workedMinutes
        : Math.max(workedMinutes - settings.unpaidLunchMinutes, 0);
    const regularMinutes = Math.min(netMinutes, capMinutes);
    const overtimeMinutes = Math.max(netMinutes - capMinutes, 0);

    const override = overrideByDay.get(date);
    const shiftStartMinutes = parseHHmm(override?.shiftStartTime ?? settings.shiftStartTime);
    const shiftEndMinutes = parseHHmm(override?.shiftEndTime ?? settings.shiftEndTime);
    const lateThreshold = shiftStartMinutes + settings.gracePeriodMinutes;

    const sortedPunches = [...dayPunches].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const firstIn = sortedPunches.find((p) => p.type === "IN");
    const lastOut = [...sortedPunches].reverse().find((p) => p.type === "OUT");

    const isLate = firstIn
      ? localMinutesOfDay(firstIn.timestamp) > lateThreshold
      : false;
    const isUndertime = lastOut
      ? localMinutesOfDay(lastOut.timestamp) < shiftEndMinutes
      : false;

    return {
      date,
      workedMinutes,
      regularMinutes,
      overtimeMinutes,
      isLate,
      isUndertime,
      dayStatus,
    };
  });
}

export function summarizePeriod(days: DailyResult[]): PeriodResult {
  const regularMinutes = days.reduce((sum, d) => sum + d.regularMinutes, 0);
  const overtimeMinutes = days.reduce((sum, d) => sum + d.overtimeMinutes, 0);
  return {
    days,
    regularHours: regularMinutes / 60,
    overtimeHours: overtimeMinutes / 60,
  };
}

/**
 * Gross pay from regular/overtime hours. For DAILY pay basis, the effective
 * hourly rate is payRate / regularHoursCapPerDay (a full 8-hour day earns
 * exactly the daily rate; overtime is paid on top at the OT multiplier).
 */
export function computePay(
  regularHours: number,
  overtimeHours: number,
  payBasis: PayBasis,
  payRate: number,
  settings: Pick<PayrollSettings, "otMultiplier" | "regularHoursCapPerDay">
): PayResult {
  const hourlyRate =
    payBasis === "HOURLY" ? payRate : payRate / settings.regularHoursCapPerDay;
  const basePay = regularHours * hourlyRate;
  const overtimePay = overtimeHours * hourlyRate * settings.otMultiplier;
  return {
    hourlyRate,
    basePay,
    overtimePay,
    grossPay: basePay + overtimePay,
  };
}

export function nextWeeklyPeriod(afterDate: Date): { start: string; end: string } {
  const zoned = toZonedTime(afterDate, TIMEZONE);
  const dayOfWeek = zoned.getDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = addDays(zoned, -daysSinceMonday);
  const sunday = addDays(monday, 6);
  return {
    start: formatInTimeZone(monday, TIMEZONE, "yyyy-MM-dd"),
    end: formatInTimeZone(sunday, TIMEZONE, "yyyy-MM-dd"),
  };
}
