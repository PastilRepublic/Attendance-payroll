export type SanitationTimingKey = "PRE_COOKING" | "POST_COOKING" | "ANYTIME";
export type SanitationScheduleKey = "DAILY" | "WEEKLY" | "MONTHLY";

/** Before-lunch duties first, then anytime, then the ones done at Time Out. */
export const TIMING_ORDER: SanitationTimingKey[] = ["PRE_COOKING", "ANYTIME", "POST_COOKING"];

export const TIMING_RANK: Record<SanitationTimingKey, number> = {
  PRE_COOKING: 0,
  ANYTIME: 1,
  POST_COOKING: 2,
};

export const TIMING_LABELS: Record<SanitationTimingKey, string> = {
  PRE_COOKING: "Before lunch",
  ANYTIME: "Anytime",
  POST_COOKING: "At Time Out",
};

export const TIMING_DESCRIPTIONS: Record<SanitationTimingKey, string> = {
  PRE_COOKING: "Finish these so the area is ready for cooking after lunch.",
  ANYTIME: "Do these whenever there is time during the shift.",
  POST_COOKING: "Finish these before you go home.",
};

export const SCHEDULE_LABELS: Record<SanitationScheduleKey, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};
