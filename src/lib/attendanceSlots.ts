import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "./payroll";

export interface DayTimeline {
  timeIn: string | null;
  breakIn: string | null;
  breakOut: string | null;
  timeOut: string | null;
}

interface PunchLike {
  type: "IN" | "OUT" | "BREAK_START" | "BREAK_END";
  timestamp: Date;
}

/**
 * One day's attendance as the same four actions the kiosk itself offers --
 * Time In, Start Break, End Break, Time Out -- rather than the old Morning/
 * Afternoon segment-index model. Time In is the day's first IN punch, Time
 * Out is the day's last OUT punch (so a full day still resolves correctly
 * even if something unusual happened mid-day), and Break In/Out is the
 * first complete Start Break -> End Break pair (typical case: one lunch
 * break/day).
 */
export interface DaySlots<T> {
  timeIn?: T;
  breakStart?: T;
  breakEnd?: T;
  timeOut?: T;
}

/** Which punch stands for each of the four slots (see computeDayTimeline). */
export function pickDaySlots<T extends PunchLike>(dayPunches: T[]): DaySlots<T> {
  const sorted = [...dayPunches].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const timeIn = sorted.find((p) => p.type === "IN");
  const timeOut = [...sorted].reverse().find((p) => p.type === "OUT");

  let breakStart: T | undefined;
  let breakEnd: T | undefined;
  for (const p of sorted) {
    if (p.type === "BREAK_START" && !breakStart) {
      breakStart = p;
    } else if (p.type === "BREAK_END" && breakStart && !breakEnd) {
      breakEnd = p;
    }
  }
  return { timeIn, breakStart, breakEnd, timeOut };
}

export function computeDayTimeline(dayPunches: PunchLike[]): DayTimeline {
  const slots = pickDaySlots(dayPunches);
  const formatTime = (p?: PunchLike) =>
    p ? formatInTimeZone(p.timestamp, TIMEZONE, "h:mm a") : null;
  return {
    timeIn: formatTime(slots.timeIn),
    breakIn: formatTime(slots.breakStart),
    breakOut: formatTime(slots.breakEnd),
    timeOut: formatTime(slots.timeOut),
  };
}
