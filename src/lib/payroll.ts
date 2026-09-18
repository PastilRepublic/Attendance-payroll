import { toZonedTime, formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, eachDayOfInterval, parseISO } from "date-fns";

export const TIMEZONE = "Asia/Manila";

export type PunchType = "IN" | "OUT" | "BREAK_START" | "BREAK_END";
export type PayBasis = "HOURLY" | "DAILY" | "FLAT_DAILY" | "OPERATION_DAY";
/** Pay bases computed per day worked (see computeDayBasedPay) rather than from total regular hours. */
export type DayBasedPayBasis = "FLAT_DAILY" | "OPERATION_DAY";

export const PAY_BASIS_LABELS: Record<PayBasis, string> = {
  HOURLY: "Hourly",
  DAILY: "Daily (prorated by hours)",
  FLAT_DAILY: "Flat daily (packing)",
  OPERATION_DAY: "Production (by operation day)",
};

export function isDayBasedPayBasis(basis: PayBasis): basis is DayBasedPayBasis {
  return basis === "FLAT_DAILY" || basis === "OPERATION_DAY";
}
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
  /** Minutes after shift start (not after the grace period) that the first
   * time-in came in; 0 when not late. */
  lateMinutes: number;
  isUndertime: boolean;
  returnedLateFromBreak: boolean;
  /** Timed in but never timed out -- e.g. started the lunch break and never
   * came back. Only the time up to the last punch counts as worked. */
  missingTimeOut: boolean;
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

/** Builds a UTC Date for a given local (Asia/Manila) calendar date and minutes-of-day. */
function atLocalMinutesOfDay(dateKey: string, minutesOfDay: number): Date {
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
  const mm = String(minutesOfDay % 60).padStart(2, "0");
  return fromZonedTime(`${dateKey}T${hh}:${mm}:00`, TIMEZONE);
}

/**
 * If the day's first punch is an IN earlier than the shift start, replaces
 * its timestamp with the shift start time. Arriving early doesn't earn extra
 * regular or overtime pay -- only hours after the shift's actual end do.
 */
function clipEarlyArrival(
  dayPunches: PunchInput[],
  dateKey: string,
  shiftStartMinutes: number
): PunchInput[] {
  if (dayPunches.length === 0) return dayPunches;
  const sorted = [...dayPunches].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const first = sorted[0];
  if (first.type !== "IN" || localMinutesOfDay(first.timestamp) >= shiftStartMinutes) {
    return sorted;
  }
  sorted[0] = { ...first, timestamp: atLocalMinutesOfDay(dateKey, shiftStartMinutes) };
  return sorted;
}

export interface BreakPair {
  start: Date;
  end: Date;
}

/**
 * Pairs sequential IN/OUT punches (sorted ascending) into worked minutes for
 * one day, and counts how many IN->OUT segments were closed. A normal day
 * has one segment (a single continuous shift, lunch not punched separately).
 * An actual lunch-break punch-out/punch-in produces a second segment, whose
 * gap already excludes the break -- so the flat unpaid-lunch deduction
 * should not also apply on top of it (see computeDailyResults below).
 *
 * BREAK_START/BREAK_END punches are a second way of marking the same kind of
 * gap: BREAK_START closes the open work interval (like an implicit OUT,
 * without counting as a segment) and BREAK_END reopens one. Each completed
 * BREAK_START->BREAK_END pair is also collected into breakPairs so callers
 * can check how long the break actually ran.
 */
export function pairPunches(
  punches: PunchInput[]
): { workedMinutes: number; segments: number; breakPairs: BreakPair[] } {
  const sorted = [...punches].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  let workedMs = 0;
  let segments = 0;
  let openIn: Date | null = null;
  let openBreakStart: Date | null = null;
  const breakPairs: BreakPair[] = [];
  for (const p of sorted) {
    if (p.type === "IN") {
      openIn = p.timestamp;
    } else if (p.type === "OUT" && openIn) {
      workedMs += p.timestamp.getTime() - openIn.getTime();
      segments += 1;
      openIn = null;
    } else if (p.type === "BREAK_START" && openIn) {
      workedMs += p.timestamp.getTime() - openIn.getTime();
      openIn = null;
      openBreakStart = p.timestamp;
    } else if (p.type === "BREAK_END" && openBreakStart) {
      breakPairs.push({ start: openBreakStart, end: p.timestamp });
      openBreakStart = null;
      openIn = p.timestamp;
    }
    // Out-of-sequence punches (e.g. a stray BREAK_END with no open break)
    // are ignored -- there's no well-defined interval to attribute them to.
  }
  return { workedMinutes: workedMs / 60000, segments, breakPairs };
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
    const rawDayPunches = punchesByDay.get(date) ?? [];
    const dayStatus = statusByDay.get(date) ?? null;

    const override = overrideByDay.get(date);
    const shiftStartMinutes = parseHHmm(override?.shiftStartTime ?? settings.shiftStartTime);
    const shiftEndMinutes = parseHHmm(override?.shiftEndTime ?? settings.shiftEndTime);
    const lateThreshold = shiftStartMinutes + settings.gracePeriodMinutes;

    const dayPunches = clipEarlyArrival(rawDayPunches, date, shiftStartMinutes);
    const { workedMinutes, segments, breakPairs } = pairPunches(dayPunches);

    if (dayStatus === "PAID_LEAVE") {
      return {
        date,
        workedMinutes,
        regularMinutes: capMinutes,
        overtimeMinutes: 0,
        isLate: false,
        lateMinutes: 0,
        isUndertime: false,
        returnedLateFromBreak: false,
        missingTimeOut: false,
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
        lateMinutes: 0,
        isUndertime: false,
        returnedLateFromBreak: false,
        missingTimeOut: false,
        dayStatus,
      };
    }

    // A second (or later) segment means the employee actually punched out and
    // back in for lunch (old-style, before Break punches existed) -- and an
    // actual BREAK_START/BREAK_END pair means the same thing. Either way that
    // gap is already excluded from workedMinutes, so don't also subtract the
    // flat unpaid-lunch minutes on top of it.
    const hadBreak = segments >= 2 || breakPairs.length > 0;
    const netMinutes = hadBreak
      ? workedMinutes
      : Math.max(workedMinutes - settings.unpaidLunchMinutes, 0);
    const regularMinutes = Math.min(netMinutes, capMinutes);
    const overtimeMinutes = Math.max(netMinutes - capMinutes, 0);

    // Strict cutoff (no grace period, unlike morning lateness) -- any break
    // that ran longer than the allowance flags the day.
    const returnedLateFromBreak = breakPairs.some(
      (b) => (b.end.getTime() - b.start.getTime()) / 60000 > settings.unpaidLunchMinutes
    );

    // dayPunches is already sorted ascending by clipEarlyArrival.
    const firstIn = dayPunches.find((p) => p.type === "IN");
    const lastOut = [...dayPunches].reverse().find((p) => p.type === "OUT");

    // The clipped firstIn can never read as late (it's pinned to shiftStart
    // when it was early); a genuinely late arrival is never clipped, so this
    // still reflects their real arrival time.
    const isLate = firstIn
      ? localMinutesOfDay(firstIn.timestamp) > lateThreshold
      : false;
    const lateMinutes =
      isLate && firstIn ? Math.max(localMinutesOfDay(firstIn.timestamp) - shiftStartMinutes, 0) : 0;
    const isUndertime = lastOut
      ? localMinutesOfDay(lastOut.timestamp) < shiftEndMinutes
      : false;

    return {
      date,
      workedMinutes,
      regularMinutes,
      overtimeMinutes,
      isLate,
      lateMinutes,
      isUndertime,
      returnedLateFromBreak,
      missingTimeOut: Boolean(firstIn) && !lastOut,
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
 * Gross pay from regular hours only. For DAILY pay basis, the effective
 * hourly rate is payRate / regularHoursCapPerDay (a full 8-hour day earns
 * exactly the daily rate). Hours worked beyond the regular cap are not
 * auto-paid -- overtime hours are still tracked and shown (see
 * computeDailyResults) as a reference for the admin to decide on a manual
 * Bonus adjustment, but never factor into gross pay here.
 */
export function computePay(
  regularHours: number,
  payBasis: "HOURLY" | "DAILY",
  payRate: number,
  settings: Pick<PayrollSettings, "regularHoursCapPerDay">
): PayResult {
  const hourlyRate =
    payBasis === "HOURLY" ? payRate : payRate / settings.regularHoursCapPerDay;
  const basePay = regularHours * hourlyRate;
  return {
    hourlyRate,
    basePay,
    grossPay: basePay,
  };
}

/** Pay per day worked for OPERATION_DAY (production) employees, by the
 * date's operation day. */
export interface OperationPayRates {
  cooking: number;
  jarFilling: number;
}

export interface PayBreakdownLine {
  label: string;
  /** Number of days at this rate. */
  days: number;
  rate: number;
  amount: number;
}

export interface DayBasedPayResult {
  basePay: number;
  grossPay: number;
  lines: PayBreakdownLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Gross pay for employees paid per day worked -- the full day's rate for any
 * day with completed punches, however few hours. Cutting a day short isn't
 * deducted here; the admin adds a "Half day" deduction on the payslip instead.
 *
 * FLAT_DAILY (packing): payRate per day worked.
 *
 * OPERATION_DAY (production): the Cooking or Jar Filling rate for that date's
 * operation day. An OFF day (nothing scheduled) that someone still worked is
 * paid at the Jar Filling rate unless an owner records it as a Cooking day.
 *
 * For both, an UNPAID_ABSENCE day pays nothing and a PAID_LEAVE day counts as
 * worked.
 */
export function computeDayBasedPay(
  days: DailyResult[],
  payBasis: DayBasedPayBasis,
  payRate: number,
  operationDayFor: (date: string) => "COOKING" | "JAR_FILLING" | "OFF",
  rates: OperationPayRates
): DayBasedPayResult {
  const counts = new Map<string, PayBreakdownLine>();
  const add = (key: string, label: string, rate: number) => {
    const line = counts.get(key) ?? { label, days: 0, rate, amount: 0 };
    line.days += 1;
    counts.set(key, line);
  };

  for (const d of days) {
    if (d.dayStatus === "UNPAID_ABSENCE") continue;
    if (d.dayStatus !== "PAID_LEAVE" && d.workedMinutes <= 0) continue;

    if (payBasis === "FLAT_DAILY") add("flat", "Day worked", payRate);
    else if (operationDayFor(d.date) === "COOKING") add("cooking", "Cooking day", rates.cooking);
    else add("jar", "Jar filling day", rates.jarFilling);
  }

  const lines = ["flat", "cooking", "jar"]
    .filter((k) => counts.has(k))
    .map((k) => {
      const line = counts.get(k)!;
      return { ...line, amount: round2(line.days * line.rate) };
    });
  const basePay = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  return { basePay, grossPay: basePay, lines };
}

/** Suggested deduction for a late morning arrival, by minutes after shift
 * start. Only a suggestion -- the admin can change the amount or skip it. The
 * grace period already keeps very short delays from being flagged as late. */
const LATE_DEDUCTION_TIERS: { minMinutes: number; amount: number }[] = [
  { minMinutes: 60, amount: 100 },
  { minMinutes: 30, amount: 50 },
  { minMinutes: 10, amount: 20 },
];

export function suggestedLateDeduction(lateMinutes: number): number {
  return LATE_DEDUCTION_TIERS.find((t) => lateMinutes >= t.minMinutes)?.amount ?? 0;
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
