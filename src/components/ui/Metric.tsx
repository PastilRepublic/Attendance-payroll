import type { Tone } from "./styles";

const TEXT: Record<Tone, string> = {
  green: "text-emerald-700",
  amber: "text-amber-700",
  rose: "text-rose-700",
  dark: "text-slate-950",
  neutral: "text-slate-900",
  accent: "text-accent-800",
};

/**
 * A calm number: small label, the figure, an optional note. Color goes on the number
 * only, never behind it. Use "big" for the one figure that matters most on a screen.
 */
export default function Metric({
  label,
  value,
  tone = "neutral",
  hint,
  big = false,
  compact = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
  big?: boolean;
  /** A size smaller, for dense screens like Finance. */
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={`mt-1 font-semibold tracking-tight ${TEXT[tone]} ${
          big
            ? compact
              ? "text-2xl sm:text-3xl"
              : "text-3xl sm:text-4xl"
            : compact
              ? "text-lg sm:text-xl"
              : "text-xl sm:text-2xl"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
