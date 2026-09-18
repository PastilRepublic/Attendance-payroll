type PresenceStatus = "OUT" | "WORKING" | "ON_BREAK" | "DONE";

const PRESENCE_DOT_STYLES: Record<PresenceStatus, string> = {
  OUT: "",
  WORKING: "bg-green-500",
  ON_BREAK: "bg-amber-500",
  DONE: "bg-sky-500",
};

const SIZE_CLASSES = {
  sm: "w-7 h-7 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-lg",
} as const;

const RING_FALLBACK_STYLES = {
  "slate-900": { border: "border-slate-900", fallbackBg: "bg-slate-600 text-white" },
  white: { border: "border-white", fallbackBg: "bg-slate-200 text-slate-600" },
} as const;

export default function Avatar({
  name,
  photoUrl,
  size = "md",
  presence,
  ringColor = "white",
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  presence?: PresenceStatus;
  ringColor?: keyof typeof RING_FALLBACK_STYLES;
}) {
  const sizeClass = SIZE_CLASSES[size];
  const { border, fallbackBg } = RING_FALLBACK_STYLES[ringColor];
  const dotClass = presence ? PRESENCE_DOT_STYLES[presence] : "";

  return (
    <span className="relative shrink-0 inline-block">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          className={`${sizeClass} rounded-full object-cover`}
        />
      ) : (
        <span
          className={`${sizeClass} rounded-full ${fallbackBg} flex items-center justify-center font-semibold`}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      {dotClass && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${border} ${dotClass}`}
        />
      )}
    </span>
  );
}
