import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { createNextPayPeriodForm } from "./actions";
import ActionForm from "@/components/ActionForm";
import Badge from "@/components/Badge";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import PillButton from "@/components/ui/PillButton";
import Banner from "@/components/ui/Banner";
import EmptyState from "@/components/ui/EmptyState";
import { pillClass } from "@/components/ui/styles";
import { currentMonthKey, isMonthKey, monthLabel, monthRange, nextPeriodToCreate } from "@/lib/payPeriods";
import MonthPicker from "@/components/ui/MonthPicker";

// Pay period dates are stored as plain dates (UTC midnight), so format them in UTC.
const fmt = (d: Date, pattern: string) => formatInTimeZone(d, "UTC", pattern);

type PeriodRow = { id: string; startDate: Date; endDate: Date; status: "OPEN" | "FINALIZED" };

function PeriodList({ periods }: { periods: PeriodRow[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {periods.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7">
          <div>
            <div className="font-medium text-slate-900">
              {fmt(p.startDate, "MMM d")} – {fmt(p.endDate, "MMM d, yyyy")}
            </div>
            <div className="mt-1">
              <Badge status={p.status === "FINALIZED" ? "finalized" : "open"} />
            </div>
          </div>
          <Link href={`/admin/payroll/${p.id}`} className={pillClass("secondary", "sm")}>
            View
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const current = currentMonthKey();
  const month = params.month && isMonthKey(params.month) && params.month <= current ? params.month : current;
  const { from, to } = monthRange(month);

  // A weekly period belongs to the month it ends in -- the month its pay is paid.
  const [periods, stillOpen, latest] = await Promise.all([
    prisma.payPeriod.findMany({
      where: { endDate: { gte: from, lt: to } },
      orderBy: { startDate: "desc" },
    }),
    // Earlier periods that were never finalized still need attention, so they stay visible.
    month === current
      ? prisma.payPeriod.findMany({
          where: { status: "OPEN", endDate: { lt: from } },
          orderBy: { startDate: "desc" },
        })
      : Promise.resolve([]),
    prisma.payPeriod.findFirst({ orderBy: { endDate: "desc" }, select: { endDate: true } }),
  ]);

  const next = nextPeriodToCreate(latest?.endDate ?? null);
  const nextLabel = `${formatInTimeZone(new Date(`${next.start}T00:00:00Z`), "UTC", "MMM d")} – ${formatInTimeZone(
    new Date(`${next.end}T00:00:00Z`),
    "UTC",
    "MMM d"
  )}`;

  return (
    <div>
      <SoftHeader
        title="Payroll"
        description="Weekly pay periods and their payslips."
        actions={
          next.canCreate ? (
            <ActionForm action={createNextPayPeriodForm} compactError>
              <PillButton>+ New pay period</PillButton>
            </ActionForm>
          ) : (
            <span className="rounded-full bg-slate-100 px-4 py-2.5 text-sm text-slate-600">
              Next period ({nextLabel}) opens {fmt(new Date(`${next.start}T00:00:00Z`), "MMM d")}
            </span>
          )
        }
      />

      <div className="mb-6">
        <Banner
          title={month === current ? "This month" : monthLabel(month)}
          description={`Pay periods that end in ${monthLabel(month)}. Pick another month to see earlier ones.`}
        >
          <MonthPicker value={month} current={current} />
        </Banner>
      </div>

      {stillOpen.length > 0 && (
        <div className="mb-6">
          <SoftCard accent="amber" padded={false}>
            <div className="px-5 pt-5 sm:px-7">
              <div className="font-medium text-amber-900">Still open from earlier months</div>
              <p className="mt-0.5 text-sm text-amber-800">These weren&apos;t finalized yet.</p>
            </div>
            <PeriodList periods={stillOpen} />
          </SoftCard>
        </div>
      )}

      <SoftCard padded={false}>
        {periods.length === 0 ? (
          <div className="p-5 sm:p-7">
            <EmptyState>No pay periods in {monthLabel(month)} yet.</EmptyState>
          </div>
        ) : (
          <PeriodList periods={periods} />
        )}
      </SoftCard>
    </div>
  );
}
