import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createNextPayPeriod } from "./actions";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";

export default async function PayrollPage() {
  const periods = await prisma.payPeriod.findMany({
    orderBy: { startDate: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Weekly pay periods and their payslips."
        actions={
          <form action={createNextPayPeriod}>
            <Button>+ New Pay Period</Button>
          </form>
        }
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {p.startDate.toISOString().slice(0, 10)} — {p.endDate.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <Badge status={p.status === "FINALIZED" ? "finalized" : "open"} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/payroll/${p.id}`} className="text-slate-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  No pay periods yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
