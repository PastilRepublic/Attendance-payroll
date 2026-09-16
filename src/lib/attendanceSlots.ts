import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "./payroll";

export interface DaySlots {
  morningIn: string | null;
  morningOut: string | null;
  afternoonIn: string | null;
  afternoonOut: string | null;
}

interface PunchLike {
  type: "IN" | "OUT";
  timestamp: Date;
}

/** Groups a day's punches (already sorted ascending) into IN/OUT segments. */
function buildSegments(dayPunches: PunchLike[]) {
  const segments: { in?: Date; out?: Date }[] = [];
  let current: { in?: Date; out?: Date } | null = null;
  for (const p of dayPunches) {
    if (p.type === "IN") {
      if (current) segments.push(current);
      current = { in: p.timestamp };
    } else if (current) {
      current.out = p.timestamp;
      segments.push(current);
      current = null;
    } else {
      segments.push({ out: p.timestamp });
    }
  }
  if (current) segments.push(current);
  return segments;
}

/**
 * Maps one day's punches onto the standard Morning In/Out, Afternoon In/Out
 * slots. One segment (a single continuous shift, lunch not punched
 * separately) maps In to Morning and Out to Afternoon. Two or more segments
 * (an actual lunch-break punch-out/in) map the first to Morning, the second
 * to Afternoon.
 */
export function computeDaySlots(dayPunches: PunchLike[]): DaySlots {
  const sorted = [...dayPunches].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const segments = buildSegments(sorted);
  const formatTime = (t?: Date) => (t ? formatInTimeZone(t, TIMEZONE, "h:mm a") : null);

  if (segments.length <= 1) {
    return {
      morningIn: formatTime(segments[0]?.in),
      morningOut: null,
      afternoonIn: null,
      afternoonOut: formatTime(segments[0]?.out),
    };
  }
  return {
    morningIn: formatTime(segments[0]?.in),
    morningOut: formatTime(segments[0]?.out),
    afternoonIn: formatTime(segments[1]?.in),
    afternoonOut: formatTime(segments[1]?.out),
  };
}
