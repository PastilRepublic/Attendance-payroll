"use client";

import { useState } from "react";
import { NEW_EXPENSE_TYPE } from "@/lib/finance";
import { inputClass, labelClass } from "@/components/ui/styles";

/**
 * "Spent on" for an expense: the built-in types, any type you added before, and + New type… which
 * shows a box to type a new one. A new type is saved with the expense and then shows in this list.
 */
export default function CategoryField({
  fixed,
  custom,
}: {
  fixed: readonly { code: string; label: string }[];
  custom: string[];
}) {
  const [choice, setChoice] = useState("");

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Spent on</label>
        <select
          name="category"
          required
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Choose…
          </option>
          {fixed.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
          {custom.length > 0 && (
            <optgroup label="Your own types">
              {custom.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          <option value={NEW_EXPENSE_TYPE}>+ New type…</option>
        </select>
      </div>
      {choice === NEW_EXPENSE_TYPE && (
        <div>
          <label className={labelClass}>Name of the new type</label>
          <input
            name="newCategory"
            required
            maxLength={30}
            autoFocus
            placeholder="e.g. Repairs"
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
