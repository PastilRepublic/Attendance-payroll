const TONES = {
  blue: "bg-blue-50 text-blue-700",
  red: "bg-rose-50 text-rose-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  accent: "bg-accent-50 text-accent-800",
} as const;

/** A 48px tinted square that holds an icon above a card title. */
export default function IconChip({
  tone = "accent",
  children,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${TONES[tone]}`}>
      {children}
    </div>
  );
}
