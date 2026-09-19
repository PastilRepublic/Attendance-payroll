"use client";

import { useState } from "react";
import { PAY_BASIS_LABELS, type PayBasis } from "@/lib/payroll";

const inputBase = "w-full rounded-md border px-3 py-2 text-sm";
const inputClass = `${inputBase} border-slate-300`;
const inputErrorClass = `${inputBase} border-red-500 bg-red-50`;

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
  // A stored 0 (Production has no rate of its own) starts blank, so switching
  // to another pay basis makes it obvious that a rate still has to be entered.
  const [payRate, setPayRate] = useState(defaultPayRate ? String(defaultPayRate) : "");
  const [rateInvalid, setRateInvalid] = useState(false);
  const rateLocked = payBasis === "OPERATION_DAY";

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Pay basis</label>
        <select
          name="payBasis"
          value={payBasis}
          onChange={(e) => {
            setPayBasis(e.target.value as PayBasis);
            setRateInvalid(false);
          }}
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
          min="0.01"
          required={!rateLocked}
          disabled={rateLocked}
          value={rateLocked ? "" : payRate}
          onChange={(e) => {
            setPayRate(e.target.value);
            setRateInvalid(false);
          }}
          onInvalid={() => setRateInvalid(true)}
          placeholder={rateLocked ? "Set in Settings" : undefined}
          aria-invalid={rateInvalid}
          className={`${rateInvalid ? inputErrorClass : inputClass} disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
        />
        {rateInvalid && (
          <p className="text-xs text-red-600 mt-1">Enter a pay rate greater than 0.</p>
        )}
      </div>
    </div>
  );
}
