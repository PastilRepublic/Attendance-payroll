import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getSettings } from "@/lib/settings";

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

  return NextResponse.json({
    employeeName: matched.name,
    payBasis: employee.payBasis,
    payslips: payslips.map((p) => {
      const adjustmentsTotal = p.adjustments.reduce((sum, a) => sum + Number(a.amount), 0);
      return {
        id: p.id,
        periodStart: p.payPeriod.startDate.toISOString().slice(0, 10),
        periodEnd: p.payPeriod.endDate.toISOString().slice(0, 10),
        status: p.status,
        regularHours: Number(p.regularHours),
        // A daily-rate employee earns their daily rate for a full regular
        // day, so days worked is regular hours over that day length.
        daysWorked: Number(p.regularHours) / hoursPerDay,
        overtimeHours: Number(p.overtimeHours),
        basePay: Number(p.basePay),
        grossPay: Number(p.grossPay),
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
