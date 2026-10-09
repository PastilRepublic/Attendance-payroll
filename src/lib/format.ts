/** Money the way the app shows it everywhere: ₱1,234.00 (a minus sign in front for negatives). */
export function formatPeso(amount: number): string {
  const body = Math.abs(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "−" : ""}₱${body}`;
}
