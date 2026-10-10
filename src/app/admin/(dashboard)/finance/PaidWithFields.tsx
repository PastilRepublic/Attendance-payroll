"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/ui/styles";

/**
 * "Paid with" for an expense: production cash, the bank, or a credit card. Choosing the
 * card shows a second field for which card. The choice stays between entries, so a run of
 * card charges doesn't need re-picking.
 */
export default function PaidWithFields({ cards }: { cards: { id: string; name: string }[] }) {
  const [paidWith, setPaidWith] = useState("CASH");

  return (
    <>
      <div>
        <label className={labelClass}>Paid with</label>
        <select
          name="paidWith"
          required
          value={paidWith}
          onChange={(e) => setPaidWith(e.target.value)}
          className={inputClass}
        >
          <option value="CASH">Production cash</option>
          <option value="BANK">Bank</option>
          <option value="CARD">Credit card</option>
        </select>
      </div>
      {paidWith === "CARD" && (
        <div>
          <label className={labelClass}>Which card</label>
          {cards.length === 0 ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No card yet. Close this, add your card under Credit cards, then come back.
            </p>
          ) : (
            <select name="cardId" required defaultValue={cards.length === 1 ? cards[0].id : ""} className={inputClass}>
              <option value="" disabled>
                Choose…
              </option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </>
  );
}
