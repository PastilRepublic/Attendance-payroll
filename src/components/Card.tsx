const ACCENT_CLASSES = {
  green: "border-l-4 border-l-green-400",
  amber: "border-l-4 border-l-amber-400",
  sky: "border-l-4 border-l-sky-400",
  rose: "border-l-4 border-l-rose-400",
  red: "border-l-4 border-l-red-400",
  none: "",
} as const;

export default function Card({
  accent = "none",
  padded = false,
  className = "",
  children,
}: {
  accent?: keyof typeof ACCENT_CLASSES;
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 ${ACCENT_CLASSES[accent]} ${padded ? "p-4" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
