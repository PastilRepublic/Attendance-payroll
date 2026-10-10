"use client";

import { useState } from "react";
import { sharePlan } from "@/lib/finance";
import { formatPeso } from "@/lib/format";
import PillButton from "@/components/ui/PillButton";

interface OwnerInfo {
  id: string;
  name: string;
  /** Shares so far minus everything taken (negative = taken ahead). */
  before: number;
  /** Taken since the last payday, for display. */
  takenSince: number;
}

/**
 * The payday part of the Owners' share card: the percentage box and, as you type, what each owner
 * gets. It lives inside the page's payday form, so the Record button submits the percentage. The
 * server works the numbers out again when saving; this is only the preview.
 */
export default function PaydayPanel({
  title,
  subtitle,
  profit,
  owners,
  maxPercent,
  defaultPercent,
  canRecord,
  hint,
  blockReason,
}: {
  title: string;
  subtitle: string;
  profit: number;
  owners: OwnerInfo[];
  maxPercent: number;
  defaultPercent?: number;
  canRecord: boolean;
  /** Short grey text beside the Record button (e.g. "Available on Oct 15"). */
  hint?: string;
  /** Why recording isn't possible, when it matters (empty otherwise). */
  blockReason?: string;
}) {
  const [text, setText] = useState(defaultPercent ? String(defaultPercent) : "");
  const percent = Number(text);
  const valid = text !== "" && Number.isFinite(percent) && percent > 0 && percent <= maxPercent;
  const plan = valid ? sharePlan(profit, percent, owners.map((o) => ({ id: o.id, before: o.before }))) : null;
  const totalPaid = plan ? plan.reduce((sum, p) => sum + p.payout, 0) : 0;

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-2xl border border-accent-200 bg-accent-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-accent-950">{title}</div>
          <div className="mt-0.5 text-sm text-accent-800">{subtitle}</div>
        </div>
        <label className="flex items-center gap-2 text-sm text-accent-900">
          <span>Each owner takes</span>
          <input
            name="percent"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            max={maxPercent}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="20"
            aria-label="Percentage of the profit each owner takes"
            className="w-20 rounded-full border border-accent-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
          <span>% of the profit</span>
        </label>
      </div>
      {text !== "" && !valid && (
        <p className="mt-2 text-xs text-red-600">Enter a percentage from 0.01 to {maxPercent}.</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {owners.map((o) => {
          const p = plan?.find((x) => x.ownerId === o.id);
          return (
            <div key={o.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-900">
                  {o.name.trim().slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{o.name}</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3 text-sm text-slate-500">
                <span>Taken since last payday</span>
                <span className="font-medium text-slate-800">{formatPeso(o.takenSince)}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3 text-sm text-slate-500">
                <span>Gets on payday</span>
                <span className={`text-xl font-semibold tracking-tight ${p ? "text-emerald-700" : "text-slate-400"}`}>
                  {p ? formatPeso(p.payout) : "—"}
                </span>
              </div>
              <div className="mt-1.5 min-h-4 text-xs text-amber-700">
                {p && p.before < 0 && <>{formatPeso(-p.before)} already taken comes off. </>}
                {p && p.before > 0 && <>{formatPeso(p.before)} owed from before is added. </>}
                {p && p.aheadAfter > 0 && <>Still {formatPeso(p.aheadAfter)} ahead, carried to the next payday.</>}
              </div>
            </div>
          );
        })}
      </div>

      {plan && profit > 0 && (
        <p className="mt-3 text-sm text-slate-500">
          Together {formatPeso(totalPaid)}, which is {Math.round((totalPaid / profit) * 1000) / 10}% of the net profit.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PillButton variant={canRecord ? "primary" : "secondary"} disabled={!canRecord}>
          Record payday
        </PillButton>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {blockReason && <p className="mt-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{blockReason}</p>}
    </div>
  );
}
