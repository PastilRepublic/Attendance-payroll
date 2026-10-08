const ACCENTS = {
  none: "border-slate-300",
  red: "border-rose-300 bg-rose-50/40",
  amber: "border-amber-300 bg-amber-50/40",
  green: "border-emerald-300 bg-emerald-50/40",
} as const;

/** The guide's card: big radius, thin border, roomy padding. */
export default function SoftCard({
  accent = "none",
  padded = true,
  className = "",
  children,
}: {
  accent?: keyof typeof ACCENTS;
  /** Standard card padding; turn off when the content (e.g. a table) goes edge to edge. */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-3xl border bg-white shadow-sm ${ACCENTS[accent]} ${padded ? "p-5 sm:p-7" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
