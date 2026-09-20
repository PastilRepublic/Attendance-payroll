interface ProgressTask {
  status: "PENDING" | "DONE";
  inspectionResult: "PASS" | "FAIL" | null;
}

/**
 * The big dark "Checklist progress" card: done out of total, with what a
 * supervisor has verified, what is still waiting for inspection and what
 * failed, and a bar showing the same split.
 */
export default function SanitationProgressCard({ tasks }: { tasks: ProgressTask[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const verified = tasks.filter((t) => t.inspectionResult === "PASS").length;
  const failed = tasks.filter((t) => t.inspectionResult === "FAIL").length;
  const waiting = tasks.filter((t) => t.status === "DONE" && t.inspectionResult === null).length;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <div className="rounded-3xl bg-slate-950 px-6 py-5 text-white">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Checklist progress</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">
            {done}
            <span className="text-xl font-semibold text-slate-400">/{total}</span>
          </p>
        </div>
        <div className="text-right text-sm font-medium leading-6">
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
        className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800"
      >
        <div className="bg-emerald-400 transition-all" style={{ width: `${pct(verified)}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${pct(waiting)}%` }} />
        <div className="bg-red-400 transition-all" style={{ width: `${pct(failed)}%` }} />
      </div>
    </div>
  );
}
