import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adjustmentsTotal, getPeriodDailyResults } from "@/lib/payrollService";
import { TIMEZONE } from "@/lib/payroll";
import { getSettings } from "@/lib/settings";
import { formatInTimeZone } from "date-fns-tz";
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
      if (d.isUndertime) flags.push("Left early");
      return { date: d.date, flags };
    })
    .filter((d) => d.flags.length > 0);

  const adjTotal = adjustmentsTotal(payslip.adjustments);
  const total = Number(payslip.grossPay) + adjTotal;

  return (
    <div className="max-w-2xl mx-auto p-10 bg-white text-slate-900">
      <div className="flex items-start justify-between mb-8 print:hidden">
        <div />
        <PrintButton />
      </div>

      <h1 className="text-2xl font-bold mb-1">Payslip</h1>
      <p className="text-sm text-slate-500 mb-6">
        {payslip.status === "FINALIZED" ? "Finalized" : "Draft — not yet finalized"}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <div className="text-slate-500">Employee</div>
          <div className="font-medium">{payslip.employee.name}</div>
        </div>
        <div>
          <div className="text-slate-500">Pay period</div>
          <div className="font-medium">
            {payslip.payPeriod.startDate.toISOString().slice(0, 10)} —{" "}
            {payslip.payPeriod.endDate.toISOString().slice(0, 10)}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Pay basis</div>
          <div className="font-medium">{payslip.employee.payBasis}</div>
        </div>
        <div>
          <div className="text-slate-500">Rate</div>
          <div className="font-medium">₱{Number(payslip.employee.payRate).toFixed(2)}</div>
        </div>
      </div>

      <table className="w-full text-sm mb-6 border-t border-slate-200">
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-2">Regular hours</td>
            <td className="py-2 text-right">{Number(payslip.regularHours).toFixed(2)}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2">Overtime hours</td>
            <td className="py-2 text-right">{Number(payslip.overtimeHours).toFixed(2)}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2">Gross pay</td>
            <td className="py-2 text-right">₱{Number(payslip.grossPay).toFixed(2)}</td>
          </tr>
          {payslip.adjustments.map((adj) => (
            <tr key={adj.id} className="border-b border-slate-100">
              <td className="py-2">
                {adj.label}
                {adj.note && <span className="text-slate-400"> — {adj.note}</span>}
              </td>
              <td className="py-2 text-right">
                {Number(adj.amount) > 0 ? "+" : ""}
                {Number(adj.amount).toFixed(2)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-3 font-bold text-base">Total</td>
            <td className="py-3 text-right font-bold text-base">₱{total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      {attendanceNotes.length > 0 && (
        <div className="mb-6 text-sm">
          <div className="font-semibold mb-2">Attendance notes</div>
          <table className="w-full border-t border-slate-200">
            <tbody>
              {attendanceNotes.map((n) => (
                <tr key={n.date} className="border-b border-slate-100">
                  <td className="py-1.5 w-40">
                    {formatInTimeZone(new Date(`${n.date}T12:00:00+08:00`), TIMEZONE, "EEE, MMM d")}
                  </td>
                  <td className="py-1.5">{n.flags.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Generated {formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd")}. This payslip reflects gross pay from
        recorded hours worked plus manual adjustments; it does not include statutory deductions.
      </p>
    </div>
  );
}
