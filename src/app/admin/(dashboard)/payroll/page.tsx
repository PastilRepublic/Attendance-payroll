import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { createNextPayPeriod } from "./actions";
import Badge from "@/components/Badge";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import PillButton from "@/components/ui/PillButton";
import EmptyState from "@/components/ui/EmptyState";
import { pillClass } from "@/components/ui/styles";

// Pay period dates are stored as plain dates (UTC midnight), so format them in UTC.
const fmt = (d: Date, pattern: string) => formatInTimeZone(d, "UTC", pattern);

export default async function PayrollPage() {
  const periods = await prisma.payPeriod.findMany({
    orderBy: { startDate: "desc" },
  });

  return (
    <div>
      <SoftHeader
        title="Payroll"
        description="Weekly pay periods and their payslips."
        actions={
          <form action={createNextPayPeriod}>
            <PillButton>+ New pay period</PillButton>
          </form>
        }
      />

      <SoftCard padded={false}>
        {periods.length === 0 ? (
          <div className="p-5 sm:p-7">
            <EmptyState>No pay periods yet. Tap “New pay period” to start the first one.</EmptyState>
          </div>
        ) : (
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
        )}
      </SoftCard>
    </div>
  );
}
