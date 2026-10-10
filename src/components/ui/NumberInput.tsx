"use client";

import type { FormEvent } from "react";
import { formatNumberText } from "@/lib/numberInput";

/**
 * A text field for amounts and quantities that adds thousands commas as you type
 * (18000 becomes 18,000). It stays uncontrolled, so forms can clear or reset it like any
 * other field. The server accepts the commas (see numberText).
 */
export default function NumberInput({
  name,
  defaultValue,
  required,
  placeholder,
  className,
  decimals = true,
  ariaLabel,
}: {
  name: string;
  defaultValue?: number | string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Allow up to two decimal places (default). Turn off for whole numbers. */
  decimals?: boolean;
  ariaLabel?: string;
}) {
  function onInput(e: FormEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const caret = el.selectionStart ?? el.value.length;
    // How many digits (and dots) sit before the caret, so it can go back to the same spot.
    const before = el.value.slice(0, caret).replace(/[^\d.]/g, "").length;
    const next = formatNumberText(el.value, decimals);
    if (next === el.value) return;
    el.value = next;
    let pos = 0;
    let seen = 0;
    while (pos < next.length && seen < before) {
      if (/[\d.]/.test(next[pos])) seen += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
  }

  return (
    <input
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      name={name}
      defaultValue={defaultValue === undefined ? undefined : formatNumberText(String(defaultValue), decimals)}
      required={required}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onInput={onInput}
      className={className}
    />
  );
}
