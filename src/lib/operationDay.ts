import { formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "Asia/Manila";

export type OperationDay = "COOKING" | "JAR_FILLING";
export type ResolvedOperationDay = OperationDay | "OFF";

// Default weekly rotation when nobody has manually overridden a date's
// operation day: alternates starting Monday, Sunday is a day off.
const WEEKDAY_ROTATION: Record<string, ResolvedOperationDay> = {
  Sunday: "OFF",
  Monday: "COOKING",
  Tuesday: "JAR_FILLING",
  Wednesday: "COOKING",
  Thursday: "JAR_FILLING",
  Friday: "COOKING",
  Saturday: "JAR_FILLING",
};

/** The rotation's operation day for a local (Asia/Manila) YYYY-MM-DD date. */
export function rotationDayForDate(dateKey: string): ResolvedOperationDay {
  const weekday = formatInTimeZone(new Date(`${dateKey}T12:00:00+08:00`), TIMEZONE, "EEEE");
  return WEEKDAY_ROTATION[weekday] ?? "COOKING";
}

/** A date's operation day: a recorded override if there is one, else the rotation. */
export function resolveOperationDayForDate(
  dateKey: string,
  overrides: ReadonlyMap<string, OperationDay>
): ResolvedOperationDay {
  return overrides.get(dateKey) ?? rotationDayForDate(dateKey);
}
