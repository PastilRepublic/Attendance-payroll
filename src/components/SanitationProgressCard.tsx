interface ProgressTask {
  status: "PENDING" | "DONE";
  inspectionResult: "PASS" | "FAIL" | null;
}

const TONES = {
  // Admin: the dark card.
  dark: {
    card: "bg-slate-900 text-white",
    label: "text-slate-400",
    total: "text-slate-400",
    verified: "text-green-400",
    waiting: "text-amber-400",
    failed: "text-red-400",
    track: "bg-slate-700",
  },
  // Kiosk: soft orange tint (the brand accent) so it stands out from the white kiosk cards.
  light: {
    card: "border border-orange-200 bg-orange-50 text-slate-900",
    label: "text-orange-800",
    total: "text-orange-400",
    verified: "text-green-700",
    waiting: "text-amber-700",
    failed: "text-red-700",
    track: "bg-white",
  },
} as const;

/**
 * The "Checklist progress" card: done out of total, with what a supervisor
 * has verified, what is still waiting for inspection and what failed, and a
 * bar showing the same split. `compact` is the kiosk sidebar size; `tone`
 * picks the dark (admin) or light (kiosk) look.
 */
export default function SanitationProgressCard({
  tasks,
  compact = false,
  tone = "dark",
}: {
  tasks: ProgressTask[];
  compact?: boolean;
  tone?: keyof typeof TONES;
}) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const verified = tasks.filter((t) => t.inspectionResult === "PASS").length;
  const failed = tasks.filter((t) => t.inspectionResult === "FAIL").length;
  const waiting = tasks.filter((t) => t.status === "DONE" && t.inspectionResult === null).length;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const c = TONES[tone];

  return (
    <div className={`${c.card} ${compact ? "rounded-2xl px-4 py-3" : "rounded-3xl px-6 py-5"}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`${c.label} ${compact ? "text-xs" : "text-sm"}`}>Checklist progress</p>
          <p className={`mt-1 font-bold tabular-nums ${compact ? "text-2xl" : "text-4xl"}`}>
            {done}
            <span className={`font-semibold ${c.total} ${compact ? "text-base" : "text-xl"}`}>/{total}</span>
          </p>
        </div>
        <div className={`text-right font-medium ${compact ? "text-xs leading-5" : "text-sm leading-6"}`}>
          <p className={c.verified}>{verified} verified</p>
          <p className={c.waiting}>{waiting} waiting</p>
          {failed > 0 && <p className={c.failed}>{failed} failed</p>}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className={`flex w-full overflow-hidden rounded-full ${c.track} ${compact ? "mt-3 h-2" : "mt-4 h-2.5"}`}
      >
        <div className="bg-green-500 transition-all" style={{ width: `${pct(verified)}%` }} />
        <div className="bg-amber-500 transition-all" style={{ width: `${pct(waiting)}%` }} />
        <div className="bg-red-500 transition-all" style={{ width: `${pct(failed)}%` }} />
      </div>
    </div>
  );
}
