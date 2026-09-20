import { formatDateKey, type ReminderPhase } from "@/lib/sanitationSchedule";

const PHASE_BADGES: Record<ReminderPhase, string> = {
  "due-today": "Due today",
  "coming-up": "Coming up",
  later: "Scheduled",
};

/**
 * Weekly reminders are amber, monthly ones the teal-blue accent -- always tinted,
 * so they read as reminders whether or not the 2-day window has opened yet.
 * The phase badge is what says how close it is (filled once it has opened).
 */
export const REMINDER_TONES = {
  WEEKLY: {
    card: "border-amber-300 bg-amber-50",
    icon: "bg-amber-100 text-amber-700",
    title: "text-amber-950",
    body: "text-amber-900",
    footer: "text-amber-800",
    badgeOpen: "border-amber-500 bg-amber-200 text-amber-900",
    badgeLater: "border-amber-400 text-amber-800",
  },
  MONTHLY: {
    card: "border-accent-200 bg-accent-50",
    icon: "bg-accent-100 text-accent-800",
    title: "text-accent-950",
    body: "text-accent-900",
    footer: "text-accent-800",
    badgeOpen: "border-accent-500 bg-accent-100 text-accent-900",
    badgeLater: "border-accent-300 text-accent-800",
  },
} as const;

function CalendarClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3v3m8-3v3M4 9h16M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M4 7v11a2 2 0 0 0 2 2h4.5M18 21a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-2.2V17.5l1 .7"
      />
    </svg>
  );
}

/** "Weekly sanitation reminder -- 5 deep-cleaning tasks are due Saturday, Sep 26." */
export default function SanitationReminderCard({
  schedule,
  count,
  dueDate,
  reminderDate,
  phase,
}: {
  schedule: "WEEKLY" | "MONTHLY";
  count: number;
  dueDate: string;
  reminderDate: string;
  phase: ReminderPhase;
}) {
  const tone = REMINDER_TONES[schedule];
  const noun = schedule === "WEEKLY" ? "deep-cleaning" : "monthly";
  return (
    <div className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${tone.card}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
        <CalendarClockIcon />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-lg font-semibold ${tone.title}`}>
            {schedule === "WEEKLY" ? "Weekly" : "Monthly"} sanitation reminder
          </p>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              phase === "later" ? tone.badgeLater : tone.badgeOpen
            }`}
          >
            {PHASE_BADGES[phase]}
          </span>
        </div>
        {count === 0 ? (
          <p className={`mt-2 text-sm ${tone.body}`}>
            No {schedule === "WEEKLY" ? "weekly" : "monthly"} tasks are set up yet.
          </p>
        ) : (
          <p className={`mt-2 text-base ${tone.body}`}>
            {count} {noun} {count === 1 ? "task is" : "tasks are"} due{" "}
            {formatDateKey(dueDate, "EEEE, MMM d")}.
          </p>
        )}
        <p className={`mt-2 text-sm font-medium ${tone.footer}`}>
          Reminder date: {formatDateKey(reminderDate, "EEEE, MMM d")}
        </p>
      </div>
    </div>
  );
}
