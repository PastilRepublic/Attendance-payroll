import { prisma } from "@/lib/prisma";
import { periodNetPay } from "@/lib/finance";

/** What a pay period comes to: every payslip's pay plus its bonuses minus its deductions. */
export async function payrollNetForPeriod(payPeriodId: string): Promise<number> {
  const payslips = await prisma.payslip.findMany({
    where: { payPeriodId },
    select: { grossPay: true, adjustments: { select: { amount: true } } },
  });
  return periodNetPay(
    payslips.map((p) => ({ gross: Number(p.grossPay), adjustments: p.adjustments.map((a) => Number(a.amount)) }))
  );
}
