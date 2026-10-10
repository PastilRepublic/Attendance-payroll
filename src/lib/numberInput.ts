/**
 * Number fields that show thousands separators while you type (18,000.50).
 * The text stays a plain string in the form, so the server turns it back into a
 * number with numberText before validating it.
 */

/** Digits with commas in the thousands, and up to 2 decimals when decimals are allowed. */
export function formatNumberText(raw: string, decimals = true): string {
  let s = raw.replace(/[^\d.]/g, "");
  if (!decimals) s = s.replace(/\./g, "");
  const dot = s.indexOf(".");
  let whole = dot === -1 ? s : s.slice(0, dot);
  const fraction = dot === -1 ? null : s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  whole = whole.replace(/^0+(?=\d)/, "");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === null ? withCommas : `${withCommas}.${fraction}`;
}

/** Takes the commas and spaces out of what a number field submitted, so "18,000.50" reads 18000.50. */
export function numberText(value: unknown): unknown {
  return typeof value === "string" ? value.replace(/[,\s]/g, "") : value;
}
