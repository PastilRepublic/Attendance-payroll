"use client";

import { useState } from "react";
import { NEW_EXPENSE_TYPE } from "@/lib/finance";
import { inputClass, labelClass } from "@/components/ui/styles";

/**
 * A choice that can also be typed in: "Spent on" for an expense, or "From" for money received. It
 * lists the built-in options, any you added before, and a last option that shows a box to type a
 * new one. A new one is saved with the entry and then shows in this list.
 */
export default function CategoryField({
  fixed,
  custom,
  label = "Spent on",
  fieldName = "category",
  newFieldName = "newCategory",
  newOptionLabel = "+ New type…",
  newBoxLabel = "Name of the new type",
  placeholder = "e.g. Repairs",
}: {
  fixed: readonly { code: string; label: string }[];
  custom: string[];
  label?: string;
  fieldName?: string;
  newFieldName?: string;
  newOptionLabel?: string;
  newBoxLabel?: string;
  placeholder?: string;
}) {
  const [choice, setChoice] = useState("");

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>{label}</label>
        <select
          name={fieldName}
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
          {custom.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={NEW_EXPENSE_TYPE}>{newOptionLabel}</option>
        </select>
      </div>
      {choice === NEW_EXPENSE_TYPE && (
        <div>
          <label className={labelClass}>{newBoxLabel}</label>
          <input
            name={newFieldName}
            required
            maxLength={30}
            autoFocus
            placeholder={placeholder}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
