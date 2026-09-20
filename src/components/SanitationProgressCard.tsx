interface ProgressTask {
  status: "PENDING" | "DONE";
  inspectionResult: "PASS" | "FAIL" | null;
}

/**
 * The dark "Checklist progress" card: done out of total, with what a
 * supervisor has verified, what is still waiting for inspection and what
 * failed, and a bar showing the same split. `compact` is the kiosk sidebar size.
 */
export default function SanitationProgressCard({
  tasks,
  compact = false,
}: {
  tasks: ProgressTask[];
  compact?: boolean;
}) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const verified = tasks.filter((t) => t.inspectionResult === "PASS").length;
  const failed = tasks.filter((t) => t.inspectionResult === "FAIL").length;
  const waiting = tasks.filter((t) => t.status === "DONE" && t.inspectionResult === null).length;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <div className={`bg-slate-950 text-white ${compact ? "rounded-2xl px-4 py-3" : "rounded-3xl px-6 py-5"}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`text-slate-400 ${compact ? "text-xs" : "text-sm"}`}>Checklist progress</p>
          <p className={`mt-1 font-bold tabular-nums ${compact ? "text-2xl" : "text-4xl"}`}>
            {done}
            <span className={`font-semibold text-slate-400 ${compact ? "text-base" : "text-xl"}`}>/{total}</span>
          </p>
        </div>
        <div className={`text-right font-medium ${compact ? "text-xs leading-5" : "text-sm leading-6"}`}>
          <p className="text-emerald-300">{verified} verified</p>
          <p className="text-amber-300">{waiting} waiting</p>
          {failed > 0 && <p className="text-red-300">{failed} failed</p>}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className={`flex w-full overflow-hidden rounded-full bg-slate-800 ${compact ? "mt-3 h-2" : "mt-4 h-2.5"}`}
      >
        <div className="bg-emerald-400 transition-all" style={{ width: `${pct(verified)}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${pct(waiting)}%` }} />
        <div className="bg-red-400 transition-all" style={{ width: `${pct(failed)}%` }} />
      </div>
    </div>
  );
}
