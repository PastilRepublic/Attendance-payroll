import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adjustmentsTotal, getPeriodDailyResults } from "@/lib/payrollService";
import { TIMEZONE, PAY_BASIS_LABELS, earlyOutFlag, type PayBreakdownLine } from "@/lib/payroll";
import { getSettings } from "@/lib/settings";
import { getEmployeeRateFor } from "@/lib/payRates";
import { formatInTimeZone } from "date-fns-tz";
import { formatPeso } from "@/lib/format";
import { pillClass } from "@/components/ui/styles";
import PrintButton from "./PrintButton";

export default async function PayslipPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: { employee: true, payPeriod: true, adjustments: true },
  });
  if (!payslip) notFound();

  // Days in this period worth pointing out on the paper copy -- flagged the
  // same way as the employee's Attendance History, so the two always agree.
  const settings = await getSettings();
  const attendanceNotes = (await getPeriodDailyResults(payslip.employeeId, payslip.payPeriod, settings))
    .map((d) => {
      const flags: string[] = [];
      if (d.dayStatus === "UNPAID_ABSENCE") flags.push("Absent");
      if (d.dayStatus === "PAID_LEAVE") flags.push("Paid leave");
      if (d.isLate) flags.push(`Late (${d.lateMinutes} min)`);
      if (d.returnedLateFromBreak) flags.push("Late back from break");
      const early = earlyOutFlag(d, payslip.employee.payBasis);
      if (early === "halfDay") flags.push("Half day");
      else if (early) flags.push("Left early");
      return { date: d.date, flags };
    })
    .filter((d) => d.flags.length > 0);

  // The rate(s) in effect during this period -- not today's rate, which may
  // have changed since.
  const rateFor = await getEmployeeRateFor(payslip.employee, payslip.payPeriod.endDate);
  const periodRates: number[] = [];
  for (let t = payslip.payPeriod.startDate.getTime(); t <= payslip.payPeriod.endDate.getTime(); t += 86400000) {
    const rate = rateFor(new Date(t).toISOString().slice(0, 10));
    if (!periodRates.includes(rate)) periodRates.push(rate);
  }

  const adjTotal = adjustmentsTotal(payslip.adjustments);
  const total = Number(payslip.grossPay) + adjTotal;
  const breakdownLines =
    (payslip.payBreakdown as { lines?: PayBreakdownLine[] } | null)?.lines ?? [];

  const peso = formatPeso;
  // Adjustments read "+₱500.00" / "−₱150.00".
  const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + peso(Math.abs(n));
  // Pay period dates are plain dates (UTC midnight), so format them in UTC.
  const periodLabel = `${formatInTimeZone(payslip.payPeriod.startDate, "UTC", "MMM d")} – ${formatInTimeZone(
    payslip.payPeriod.endDate,
    "UTC",
    "MMM d, yyyy"
  )}`;
  const finalized = payslip.status === "FINALIZED";

  const details: [string, string][] = [
    ["Employee", payslip.employee.name],
    ["Pay period", periodLabel],
    ["Pay basis", PAY_BASIS_LABELS[payslip.employee.payBasis]],
    [
      "Rate",
      payslip.employee.payBasis === "OPERATION_DAY"
        ? "By operation day"
        : periodRates.map((r) => peso(r)).join(" → "),
    ],
  ];

  return (
    <div className="min-h-screen bg-page px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/payroll/${payslip.payPeriodId}`} className={pillClass("secondary", "sm")}>
          ← Back to payroll
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-300 bg-white p-6 text-slate-900 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-lg font-extrabold text-amber-400 print:[print-color-adjust:exact]">
              PR
            </span>
            <div>
              <div className="font-semibold leading-tight">The Famous Pastil Republic</div>
              <div className="text-xs text-slate-500">Payslip</div>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium print:border print:border-slate-300 ${
              finalized ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {finalized ? "Finalized" : "Draft — not yet finalized"}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 print:bg-white">
              <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-0.5 font-medium">{value}</div>
            </div>
          ))}
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 text-sm">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-2.5 text-slate-600">Regular hours</td>
                <td className="px-4 py-2.5 text-right">{Number(payslip.regularHours).toFixed(2)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-2.5 text-slate-600">Overtime hours</td>
                <td className="px-4 py-2.5 text-right">{Number(payslip.overtimeHours).toFixed(2)}</td>
              </tr>
              {breakdownLines.map((l) => (
                <tr key={`${l.label}-${l.rate}`} className="border-b border-slate-100 text-slate-600">
                  <td className="px-4 py-2.5 pl-8">
                    {l.days} × {l.label} @ {peso(l.rate)}
                  </td>
                  <td className="px-4 py-2.5 text-right">{peso(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold print:bg-white">
                <td className="px-4 py-3">Gross pay</td>
                <td className="px-4 py-3 text-right">{peso(Number(payslip.grossPay))}</td>
              </tr>
              {payslip.adjustments.map((adj) => {
                const amount = Number(adj.amount);
                return (
                  <tr key={adj.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className={amount > 0 ? "text-emerald-800" : "text-rose-800"}>{adj.label}</span>
                      {adj.note && <span className="text-slate-400"> — {adj.note}</span>}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        amount > 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {signed(amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mb-6 flex items-center justify-between rounded-2xl bg-slate-950 px-5 py-4 text-white print:border-2 print:border-slate-900 print:bg-white print:text-slate-900">
          <span className="text-sm font-medium text-slate-300 print:text-slate-700">Total to pay</span>
          <span className="text-2xl font-extrabold tracking-tight">{peso(total)}</span>
        </div>

        {attendanceNotes.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 text-sm font-semibold">Attendance notes</div>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 text-sm">
              {attendanceNotes.map((n) => (
                <li key={n.date} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="font-medium">
                    {formatInTimeZone(new Date(`${n.date}T12:00:00+08:00`), TIMEZONE, "EEE, MMM d")}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {n.flags.map((f) => (
                      <span
                        key={f}
                        className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 print:bg-white"
                      >
                        {f}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Generated {formatInTimeZone(new Date(), TIMEZONE, "MMM d, yyyy")}. This payslip reflects gross pay from
          recorded hours worked plus manual adjustments; it does not include statutory deductions.
        </p>
      </div>
    </div>
  );
}
