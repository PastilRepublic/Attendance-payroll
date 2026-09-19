"use client";

import { useState } from "react";
import { PAY_BASIS_LABELS, type PayBasis } from "@/lib/payroll";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

/** Pay basis + pay rate pair. Production pay comes from the Cooking / Jar
 * Filling rates in Settings, so the per-employee rate is locked for it. */
export default function PayBasisFields({
  defaultPayBasis,
  defaultPayRate,
}: {
  defaultPayBasis?: PayBasis;
  defaultPayRate?: number;
}) {
  const [payBasis, setPayBasis] = useState<PayBasis>(defaultPayBasis ?? "HOURLY");
  const [payRate, setPayRate] = useState(defaultPayRate === undefined ? "" : String(defaultPayRate));
  const rateLocked = payBasis === "OPERATION_DAY";

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Pay basis</label>
        <select
          name="payBasis"
          value={payBasis}
          onChange={(e) => setPayBasis(e.target.value as PayBasis)}
          className={inputClass}
        >
          {(Object.keys(PAY_BASIS_LABELS) as PayBasis[]).map((basis) => (
            <option key={basis} value={basis}>
              {PAY_BASIS_LABELS[basis]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Pay rate (₱)</label>
        <input
          name="payRate"
          type="number"
          step="0.01"
          min="0"
          disabled={rateLocked}
          value={rateLocked ? "" : payRate}
          onChange={(e) => setPayRate(e.target.value)}
          placeholder={rateLocked ? "Set in Settings" : undefined}
          className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
        />
      </div>
    </div>
  );
}
