import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getSettings } from "@/lib/settings";
import { getPeriodDailyResults } from "@/lib/payrollService";
import type { PayBreakdownLine } from "@/lib/payroll";

function breakdownLines(json: unknown): PayBreakdownLine[] | null {
  const lines = (json as { lines?: PayBreakdownLine[] } | null)?.lines;
  return Array.isArray(lines) ? lines : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;

  if (!pin || !employeeId) {
    return NextResponse.json({ error: "PIN and employeeId are required" }, { status: 400 });
  }

  const matched = await resolveEmployeeByPin(pin, employeeId);
  if (!matched) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  const [employee, settings] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: matched.id }, select: { payBasis: true } }),
    getSettings(),
  ]);
  const hoursPerDay = Number(settings.regularHoursCapPerDay);

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: matched.id },
    include: { payPeriod: true, adjustments: true },
    orderBy: { payPeriod: { startDate: "desc" } },
    take: 20,
  });

  const attendance = await Promise.all(
    payslips.map((p) => getPeriodDailyResults(matched.id, p.payPeriod, settings))
  );

  return NextResponse.json({
    employeeName: matched.name,
    payBasis: employee.payBasis,
    payslips: payslips.map((p, i) => {
      const days = attendance[i];
      const adjustmentsTotal = p.adjustments.reduce((sum, a) => sum + Number(a.amount), 0);
      return {
        id: p.id,
        periodStart: p.payPeriod.startDate.toISOString().slice(0, 10),
        periodEnd: p.payPeriod.endDate.toISOString().slice(0, 10),
        status: p.status,
        regularHours: Number(p.regularHours),
        // Flat-daily and production staff are paid per day, so count the days
        // on the payslip's breakdown (a half day counts as one). Otherwise a
        // daily-rate employee earns their rate for a full regular day, so days
        // worked is regular hours over that day length.
        daysWorked: breakdownLines(p.payBreakdown)
          ? breakdownLines(p.payBreakdown)!.reduce((sum, l) => sum + l.days, 0)
          : Number(p.regularHours) / hoursPerDay,
        overtimeHours: Number(p.overtimeHours),
        basePay: Number(p.basePay),
        grossPay: Number(p.grossPay),
        absentDays: days.filter((d) => d.dayStatus === "UNPAID_ABSENCE").length,
        lateCount: days.filter((d) => d.isLate).length,
        lateMinutes: days.reduce((sum, d) => sum + d.lateMinutes, 0),
        adjustments: p.adjustments.map((a) => ({
          label: a.label,
          amount: Number(a.amount),
          note: a.note,
        })),
        adjustmentsTotal,
        totalPay: Number(p.grossPay) + adjustmentsTotal,
      };
    }),
  });
}
