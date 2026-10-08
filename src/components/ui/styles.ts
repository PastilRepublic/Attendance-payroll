/**
 * Class recipes from docs/ui-guide.md. Use these (or the components in this
 * folder) for anything outside the kiosk and Sanitation, so the app looks like
 * one product.
 */

export type PillVariant = "primary" | "dark" | "secondary" | "destructive";
export type PillSize = "md" | "sm";

const PILL_VARIANTS: Record<PillVariant, string> = {
  primary: "bg-accent-800 text-white hover:bg-accent-900",
  dark: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200",
  destructive: "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
};

const PILL_SIZES: Record<PillSize, string> = {
  md: "px-5 py-2.5 text-sm",
  sm: "px-3.5 py-1.5 text-xs",
};

/** Pill-shaped button classes -- also for <Link>/<a> that should look like a button. */
export function pillClass(variant: PillVariant = "primary", size: PillSize = "md", extra = ""): string {
  return `inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${PILL_VARIANTS[variant]} ${PILL_SIZES[size]} ${extra}`.trim();
}

/** Pill-shaped text input / select / date input. */
export const inputClass =
  "w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200";

/** Smaller input for dense rows. */
export const inputSmClass =
  "rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200";

/** Multi-line text field. */
export const textareaClass =
  "w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200";

/** Label above a field. */
export const labelClass = "mb-1 block text-sm font-medium text-slate-800";

/** Small uppercase label (GROSS, etc.). */
export const smallLabelClass = "text-xs uppercase tracking-wide text-slate-500";

export type Tone = "green" | "amber" | "rose" | "dark" | "neutral" | "accent";

/** Tinted background + text colors that carry meaning (see the guide). */
export const TONES: Record<Tone, { box: string; label: string; value: string }> = {
  green: { box: "bg-emerald-50", label: "text-emerald-800", value: "text-emerald-950" },
  amber: { box: "bg-amber-50", label: "text-amber-800", value: "text-amber-950" },
  rose: { box: "bg-rose-50", label: "text-rose-800", value: "text-rose-950" },
  dark: { box: "bg-slate-950", label: "text-slate-300", value: "text-white" },
  neutral: { box: "bg-slate-50", label: "text-slate-500", value: "text-slate-900" },
  accent: { box: "bg-accent-50", label: "text-accent-800", value: "text-accent-950" },
};
