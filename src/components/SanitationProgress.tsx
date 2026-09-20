interface SanitationProgressTask {
  status: "PENDING" | "DONE";
  inspectionResult: "PASS" | "FAIL" | null;
}

/**
 * Checklist progress for today's sanitation duties: how many are done out of
 * the total, split into what a supervisor has verified (passed), what is
 * still waiting for inspection, and what failed. The filled bar shows those
 * three colors in proportion to the total.
 */
export default function SanitationProgress({ tasks }: { tasks: SanitationProgressTask[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const verified = tasks.filter((t) => t.inspectionResult === "PASS").length;
  const failed = tasks.filter((t) => t.inspectionResult === "FAIL").length;
  const waiting = tasks.filter((t) => t.status === "DONE" && t.inspectionResult === null).length;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const allVerified = total > 0 && verified === total;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-sm font-semibold text-slate-700">Checklist progress</p>
        <p className="text-sm font-semibold text-slate-900 tabular-nums">
          {done}/{total}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className="bg-green-500 transition-all" style={{ width: `${pct(verified)}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${pct(waiting)}%` }} />
        <div className="bg-red-500 transition-all" style={{ width: `${pct(failed)}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {allVerified ? "All verified" : `${verified} verified`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          {waiting} waiting
        </span>
        {failed > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {failed} failed
          </span>
        )}
      </div>
    </div>
  );
}
