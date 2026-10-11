import { TONES, type Tone } from "./styles";

/** A tinted number tile: small label, big bold value (the guide's stat tile). */
export default function StatTile({
  label,
  value,
  tone = "neutral",
  hint,
  icon,
  footer,
  compact = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
  icon?: React.ReactNode;
  /** Something to do, under the number (a button). */
  footer?: React.ReactNode;
  /** A size smaller, for dense screens like Payroll. */
  compact?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-2xl ${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"} ${t.box}`}>
      {icon && <div className={`${compact ? "mb-1" : "mb-2"} ${t.label}`}>{icon}</div>}
      <div className={`text-sm font-medium ${t.label}`}>{label}</div>
      <div className={`mt-1 font-extrabold tracking-tight ${compact ? "text-base sm:text-2xl" : "text-lg sm:text-3xl"} ${t.value}`}>{value}</div>
      {hint && <div className={`mt-1 text-xs ${t.label}`}>{hint}</div>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
