import StatTile from "@/components/ui/StatTile";
import { formatPeso } from "@/lib/format";

const ICON = "h-6 w-6";

function TrendUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 17 6-6 4 4 8-8M15 7h6v6" />
    </svg>
  );
}

function TrendDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 7 6 6 4-4 8 8M15 17h6v-6" />
    </svg>
  );
}

function Flag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 0h11l-2 4 2 4H5" />
    </svg>
  );
}

function Wallet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Zm13 6h2"
      />
    </svg>
  );
}

/**
 * The week at a glance: what the team earned, what comes off, what still needs
 * a look before the period is finalized, and the total to pay out.
 */
export default function PeriodSummary({
  grossTotal,
  bonusTotal,
  deductionTotal,
  openItems,
  employeeCount,
}: {
  grossTotal: number;
  bonusTotal: number;
  /** A positive number: the sum of all deductions. */
  deductionTotal: number;
  /** How many things still need a look before finalizing. */
  openItems: number;
  employeeCount: number;
}) {
  const net = grossTotal + bonusTotal - deductionTotal;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatTile
        tone="green"
        icon={<TrendUp />}
        label="Gross pay"
        value={formatPeso(grossTotal)}
        hint={`${employeeCount} ${employeeCount === 1 ? "person" : "people"}`}
      />
      <StatTile
        tone="rose"
        icon={<TrendDown />}
        label="Deductions"
        value={formatPeso(deductionTotal)}
        hint={bonusTotal > 0 ? `Bonuses add ${formatPeso(bonusTotal)}` : "No bonuses this period"}
      />
      <StatTile
        tone="amber"
        icon={<Flag />}
        label="To review"
        value={openItems === 0 ? "All clear" : String(openItems)}
        hint={openItems === 0 ? "Nothing waiting" : openItems === 1 ? "item before finalizing" : "items before finalizing"}
      />
      <StatTile tone="dark" icon={<Wallet />} label="Total to pay" value={formatPeso(net)} hint="Gross + bonuses − deductions" />
    </div>
  );
}
