import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import RiskDot from "@/components/RiskDot";
import { ensureTodaysSanitationSchedule, todayManila } from "@/lib/sanitation";

export const dynamic = "force-dynamic";

export default async function SanitationBoardPage() {
  await ensureTodaysSanitationSchedule();
  const date = todayManila();

  const assignments = await prisma.sanitationAssignment.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
    include: { procedure: true, employee: true },
    orderBy: { procedure: { name: "asc" } },
  });

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 flex items-center justify-between gap-3 py-4 px-4 sm:px-6">
        <h1 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
          The Famous Pastil Republic
        </h1>
        <Link
          href="/"
          className="shrink-0 rounded-md bg-slate-900 text-white px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium hover:bg-slate-800"
        >
          Home
        </Link>
      </div>

      <div className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">
            Sanitation Inspection &amp; Schedule
          </h2>
          <p className="text-sm text-slate-500 mb-6">{date} — who&apos;s in charge of what today</p>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Area / Equipment</th>
                  <th className="px-4 py-2 font-medium">Duty</th>
                  <th className="px-4 py-2 font-medium">Signed off by</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-700">{a.procedure.areaEquipment}</td>
                    <td className="px-4 py-2 text-slate-900 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <RiskDot level={a.procedure.riskLevel} />
                        {a.procedure.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {a.employee ? (
                        <>
                          {a.employee.name}
                          {a.completedAt && (
                            <span className="text-slate-400 text-xs ml-1.5">
                              {formatInTimeZone(a.completedAt, TIMEZONE, "h:mm a")}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400 italic">Team</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {a.inspectionResult ? (
                        <Badge status={a.inspectionResult === "PASS" ? "pass" : "fail"}>
                          {a.inspectionResult === "PASS" ? "Passed" : "Failed"}
                        </Badge>
                      ) : a.status === "DONE" ? (
                        <Badge status="awaiting">Done — awaiting inspection</Badge>
                      ) : (
                        <Badge status="pending" />
                      )}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      No sanitation assignments scheduled for today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
