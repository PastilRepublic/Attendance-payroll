export interface Reminder {
  key: string;
  /** "overdue" is red, "soon" is amber. */
  tone: "overdue" | "soon";
  /** The words to show; the first bit (the name) is made bold. */
  name: string;
  rest: string;
}

/**
 * A thin banner that slides the reminders across, over and over, so they are always seen without
 * taking up space. Plain CSS animation (no scripting), so it costs nothing to run. It pauses while
 * you hover or press it, and shows ordinary lines for anyone who asked their device to reduce
 * motion (see .ticker in globals.css).
 */
export default function ReminderTicker({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) return null;

  const worst = reminders.some((r) => r.tone === "overdue") ? "overdue" : "soon";
  const chars = reminders.reduce((sum, r) => sum + r.name.length + r.rest.length, 0);
  // Roughly a steady reading pace, however many reminders there are.
  const seconds = Math.max(20, Math.round(chars * 0.18));

  const copy = (hidden: boolean, index: number) => (
    <ul key={index} className="ticker-copy" aria-hidden={hidden || undefined}>
      {reminders.map((r) => (
        <li key={r.key} className={r.tone === "overdue" ? "text-rose-900" : "text-amber-900"}>
          <span
            className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${
              r.tone === "overdue" ? "bg-rose-500" : "bg-amber-500"
            }`}
          />
          <span className="font-semibold">{r.name}</span> {r.rest}
        </li>
      ))}
    </ul>
  );

  return (
    <div
      role="status"
      aria-label="Reminders"
      className={`ticker rounded-full border px-5 py-2 text-sm ${
        worst === "overdue" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="ticker-track" style={{ ["--ticker-seconds" as string]: `${seconds}s` }}>
        {[0, 1, 2, 3, 4, 5].map((i) => copy(i > 0, i))}
      </div>
    </div>
  );
}
