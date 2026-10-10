/** The colors of a card, picked from the bank's name. Anything else is a dark slate card. */
const THEMES = {
  blue: "from-blue-600 to-blue-900",
  red: "from-red-600 to-red-900",
  slate: "from-slate-700 to-slate-900",
} as const;

export function cardTheme(name: string): keyof typeof THEMES {
  if (/metro/i.test(name)) return "blue";
  if (/\bbpi\b|bank of the philippine/i.test(name)) return "red";
  return "slate";
}

export type CardStatus = "overdue" | "soon" | "due" | "clear";

/**
 * One credit card drawn like the real thing (card-shaped, bank color, chip). The amount due is
 * the big number; the line under it says when. The buttons live outside, under the card.
 */
export default function CreditCardFace({
  name,
  amount,
  amountLabel,
  status,
  statusText,
}: {
  name: string;
  amount: string;
  amountLabel: string;
  status: CardStatus;
  statusText: string;
}) {
  const badge =
    status === "overdue"
      ? "bg-white text-rose-700 font-semibold"
      : status === "soon"
        ? "bg-white text-amber-800 font-semibold"
        : "bg-white/15 text-white";

  return (
    <div
      className={`relative flex aspect-[1.586/1] min-h-[11rem] w-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${THEMES[cardTheme(name)]} p-5 text-white`}
    >
      {/* soft circles, like the shine on a real card */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/10" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 truncate text-lg font-semibold tracking-wide">{name}</div>
        <div className="h-7 w-10 shrink-0 rounded-md bg-gradient-to-br from-amber-200 to-amber-400" aria-hidden />
      </div>

      <div className="relative">
        <div className="text-xs uppercase tracking-wide text-white/75">{amountLabel}</div>
        <div className="text-3xl font-extrabold tracking-tight">{amount}</div>
        <div className={`mt-2 inline-block rounded-full px-3 py-1 text-xs ${badge}`}>{statusText}</div>
      </div>
    </div>
  );
}
