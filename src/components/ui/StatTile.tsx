import { TONES, type Tone } from "./styles";

/** A tinted number tile: small label, big bold value (the guide's stat tile). */
export default function StatTile({
  label,
  value,
  tone = "neutral",
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
  icon?: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-2xl p-5 ${t.box}`}>
      {icon && <div className={`mb-2 ${t.label}`}>{icon}</div>}
      <div className={`text-sm font-medium ${t.label}`}>{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tracking-tight ${t.value}`}>{value}</div>
      {hint && <div className={`mt-1 text-xs ${t.label}`}>{hint}</div>}
    </div>
  );
}
