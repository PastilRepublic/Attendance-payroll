"use client";

import { useState } from "react";
import { sharePlan } from "@/lib/finance";
import { formatPeso } from "@/lib/format";
import { inputClass, labelClass } from "@/components/ui/styles";

/**
 * The percentage box for a payday, with what each owner would get shown as you type. The server
 * works the numbers out again when saving; this is only a preview.
 */
export default function PaydayFields({
  profit,
  owners,
  maxPercent,
  defaultPercent,
}: {
  profit: number;
  owners: { id: string; name: string; before: number }[];
  maxPercent: number;
  defaultPercent?: number;
}) {
  const [text, setText] = useState(defaultPercent ? String(defaultPercent) : "");
  const percent = Number(text);
  const valid = text !== "" && Number.isFinite(percent) && percent > 0 && percent <= maxPercent;
  const plan = valid ? sharePlan(profit, percent, owners.map((o) => ({ id: o.id, before: o.before }))) : null;
  const totalPaid = plan ? plan.reduce((sum, p) => sum + p.payout, 0) : 0;

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Percentage of the profit each owner takes (%)</label>
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
          placeholder="e.g. 20"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">Up to {maxPercent}% each. You choose it every payday.</p>
      </div>

      {plan ? (
        <>
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
          {plan.map((p) => {
            const name = owners.find((o) => o.id === p.ownerId)?.name ?? "Owner";
            return (
              <li key={p.ownerId} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-slate-800">{name}</span>
                  <span className="text-base font-semibold text-slate-900">{formatPeso(p.payout)}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Share {formatPeso(p.share)}
                  {p.before < 0 && <> · {formatPeso(-p.before)} already taken</>}
                  {p.before > 0 && <> · {formatPeso(p.before)} owed from before</>}
                  {p.aheadAfter > 0 && <> · still {formatPeso(p.aheadAfter)} ahead, comes off next payday</>}
                </div>
              </li>
            );
          })}
        </ul>
        {profit > 0 && (
          <p className="text-xs text-slate-500">
            Together the owners are paid {formatPeso(totalPaid)}, which is{" "}
            {Math.round((totalPaid / profit) * 1000) / 10}% of the {formatPeso(profit)} net profit.
          </p>
        )}
        </>
      ) : (
        text !== "" && <p className="text-xs text-red-600">Enter a percentage from 0.01 to {maxPercent}.</p>
      )}
    </div>
  );
}
