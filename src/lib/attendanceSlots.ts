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
export function computeDayTimeline(dayPunches: PunchLike[]): DayTimeline {
  const sorted = [...dayPunches].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const formatTime = (t?: Date) => (t ? formatInTimeZone(t, TIMEZONE, "h:mm a") : null);

  const firstIn = sorted.find((p) => p.type === "IN");
  const lastOut = [...sorted].reverse().find((p) => p.type === "OUT");

  let breakStart: Date | undefined;
  let breakEnd: Date | undefined;
  for (const p of sorted) {
    if (p.type === "BREAK_START" && !breakStart) {
      breakStart = p.timestamp;
    } else if (p.type === "BREAK_END" && breakStart && !breakEnd) {
      breakEnd = p.timestamp;
    }
  }

  return {
    timeIn: formatTime(firstIn?.timestamp),
    breakIn: formatTime(breakStart),
    breakOut: formatTime(breakEnd),
    timeOut: formatTime(lastOut?.timestamp),
  };
}
