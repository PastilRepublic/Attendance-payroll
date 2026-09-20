import { formatDateKey, type ReminderPhase } from "@/lib/sanitationSchedule";

const PHASE_BADGES: Record<ReminderPhase, string> = {
  "due-today": "Due today",
  "coming-up": "Coming up",
  later: "Scheduled",
};

/**
 * "Weekly sanitation reminder -- 5 deep-cleaning tasks are due Saturday, Sep 26."
 * Highlighted (amber) once the reminder window has opened, quiet before that.
 */
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
  const active = phase !== "later";
  const noun = schedule === "WEEKLY" ? "deep-cleaning" : "monthly";
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        active ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold text-slate-900">
          {schedule === "WEEKLY" ? "Weekly" : "Monthly"} sanitation reminder
        </p>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            active
              ? "border-amber-400 text-amber-800"
              : "border-slate-300 text-slate-600"
          }`}
        >
          {PHASE_BADGES[phase]}
        </span>
      </div>
      {count === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No {schedule === "WEEKLY" ? "weekly" : "monthly"} tasks are set up yet.
        </p>
      ) : (
        <p className="mt-2 text-base text-slate-700">
          {count} {noun} {count === 1 ? "task is" : "tasks are"} due{" "}
          {formatDateKey(dueDate, "EEEE, MMM d")}.
        </p>
      )}
      <p className={`mt-2 text-sm font-medium ${active ? "text-amber-800" : "text-slate-500"}`}>
        Reminder date: {formatDateKey(reminderDate, "EEEE, MMM d")}
      </p>
    </div>
  );
}
