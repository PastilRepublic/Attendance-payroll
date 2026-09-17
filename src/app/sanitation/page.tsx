import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";

export const dynamic = "force-dynamic";

function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

function RiskDot({ level }: { level: "LOW" | "MEDIUM" | "HIGH" }) {
  const color =
    level === "HIGH" ? "bg-red-500" : level === "MEDIUM" ? "bg-amber-500" : "bg-green-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={`${level} risk`} />;
}

export default async function SanitationBoardPage() {
  const date = todayManila();

  const assignments = await prisma.sanitationAssignment.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
    include: { procedure: true, employee: true },
    orderBy: { procedure: { name: "asc" } },
  });

  return (
    <div className="flex-1 flex flex-col bg-slate-100">
      <div className="bg-slate-900 text-white flex items-center justify-between gap-3 py-4 px-4 sm:px-6">
        <h1 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight">
          The Famous Pastil Republic
        </h1>
        <Link
          href="/"
          className="shrink-0 rounded-md bg-white border border-slate-300 text-slate-900 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium hover:bg-slate-50"
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

          <div className="bg-white rounded-lg shadow overflow-x-auto">
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
                      {a.employee ? a.employee.name : <span className="text-slate-400 italic">Team</span>}
                    </td>
                    <td className="px-4 py-2">
                      {a.inspectionResult ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            a.inspectionResult === "PASS"
                              ? "bg-green-100 text-green-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {a.inspectionResult === "PASS" ? "Passed" : "Failed"}
                        </span>
                      ) : a.status === "DONE" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                          Done — awaiting inspection
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">
                          Pending
                        </span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
