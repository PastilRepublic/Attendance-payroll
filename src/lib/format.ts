/** Money the way the app shows it everywhere: ₱1,234.00 (a minus sign in front for negatives). */
export function formatPeso(amount: number): string {
  const body = Math.abs(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "−" : ""}₱${body}`;
}

/** A quantity with thousands commas and at most two decimals: 12,000 or 1,250.5. */
export function formatQty(amount: number): string {
  return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Money without the peso sign, for table cells that already say what they are: 1,234.50. */
export function formatAmount(amount: number): string {
  return Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
