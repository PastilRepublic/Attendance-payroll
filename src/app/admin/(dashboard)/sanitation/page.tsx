import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import {
  createProcedure,
  updateProcedure,
  assignSanitation,
  deleteSanitationAssignment,
  inspectSanitationAssignment,
  passAllSanitationAssignments,
} from "./actions";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import RiskDot from "@/components/RiskDot";
import { ensureTodaysSanitationSchedule, todayManila } from "@/lib/sanitation";

function riskAccent(level: "LOW" | "MEDIUM" | "HIGH") {
  return level === "HIGH" ? "red" : level === "MEDIUM" ? "amber" : "green";
}

const SCOPE_LABELS: Record<"COOKING" | "JAR_FILLING" | "BOTH", string> = {
  COOKING: "Cooking Day only",
  JAR_FILLING: "Jar Filling Day only",
  BOTH: "Every day",
};

const TIMING_LABELS: Record<"PRE_COOKING" | "POST_COOKING" | "ANYTIME", string> = {
  PRE_COOKING: "Before lunch",
  POST_COOKING: "At Time Out",
  ANYTIME: "Anytime",
};

export default async function SanitationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ?? todayManila();
  if (date === todayManila()) {
    await ensureTodaysSanitationSchedule();
  }

  const [procedures, assignments, recentSignoffs, passCount, failCount] = await Promise.all([
    prisma.sanitationProcedure.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.sanitationAssignment.findMany({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      include: { procedure: true, employee: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sanitationAssignment.findMany({
      where: { status: "DONE", employeeId: { not: null } },
      include: { procedure: true, employee: true },
      orderBy: { completedAt: "desc" },
      take: 15,
    }),
    prisma.sanitationAssignment.count({ where: { inspectionResult: "PASS" } }),
    prisma.sanitationAssignment.count({ where: { inspectionResult: "FAIL" } }),
  ]);

  const doneCount = assignments.filter((a) => a.status === "DONE").length;
  const pendingChecks = assignments.filter((a) => a.status === "DONE" && !a.inspectionResult).length;
  const totalInspected = passCount + failCount;
  const complianceRate = totalInspected > 0 ? Math.round((passCount / totalInspected) * 100) : null;

  return (
    <div>
      <PageHeader title="Sanitation" description="SOP library, today's schedule, and inspection sign-offs." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card padded>
          <p className="text-xs text-slate-400 mb-1">Compliance rate</p>
          <p className="text-lg font-semibold text-slate-900">
            {complianceRate === null ? (
              <span className="text-slate-400 text-sm font-normal">No inspections yet</span>
            ) : (
              <>
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    complianceRate >= 90 ? "bg-green-500" : complianceRate >= 70 ? "bg-amber-500" : "bg-red-500"
                  }`}
                />
                {complianceRate}%
              </>
            )}
          </p>
        </Card>
        <Card padded>
          <p className="text-xs text-slate-400 mb-1">Duties logged today</p>
          <p className="text-lg font-semibold text-slate-900">
            {doneCount} / {assignments.length} Done
          </p>
        </Card>
        <Card padded>
          <p className="text-xs text-slate-400 mb-1">Pending checks</p>
          <p className={`text-lg font-semibold ${pendingChecks > 0 ? "text-amber-600" : "text-slate-900"}`}>
            {pendingChecks} {pendingChecks === 1 ? "duty" : "duties"} awaiting inspection
          </p>
        </Card>
      </div>

      <details className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          Cleaning Procedures ({procedures.length})
        </summary>
        <div className="p-4 pt-0">
          <div className="space-y-3 mb-4">
            {procedures.map((p) => (
              <Card key={p.id} accent={riskAccent(p.riskLevel)} className="p-3 text-sm">
                <p className="font-semibold text-slate-900 flex items-center gap-2">
                  {p.name}
                  <span className="text-xs font-normal text-slate-400">({p.riskLevel.toLowerCase()} risk)</span>
                  <span className="text-xs font-normal text-slate-400">· {SCOPE_LABELS[p.appliesTo]}</span>
                  {p.bonusAmount && (
                    <span className="text-xs font-normal text-amber-600">· ₱{Number(p.bonusAmount).toFixed(2)} bonus</span>
                  )}
                  {p.timing !== "ANYTIME" && (
                    <span className="text-xs font-normal text-slate-400">· {TIMING_LABELS[p.timing]}</span>
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-1 text-slate-600">
                  <p><span className="text-slate-400">Area/Equipment:</span> {p.areaEquipment}</p>
                  <p><span className="text-slate-400">Sanitizer Agent:</span> {p.chemicals}</p>
                  <p><span className="text-slate-400">Frequency:</span> {p.frequency}</p>
                  <p><span className="text-slate-400">Responsible role:</span> {p.responsibleRole}</p>
                </div>
                <p className="mt-2 text-slate-600 whitespace-pre-wrap">
                  <span className="text-slate-400">Steps:</span> {p.steps}
                </p>
                <EditProcedureForm procedure={{ ...p, bonusAmount: p.bonusAmount ? Number(p.bonusAmount) : null }} />
              </Card>
            ))}
            {procedures.length === 0 && (
              <p className="text-slate-400 text-sm">No procedures yet — add one below.</p>
            )}
          </div>
          <form action={createProcedure} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Name</label>
              <input
                name="name"
                required
                placeholder="Pressure Canner Sanitization"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Area / Equipment</label>
              <input
                name="areaEquipment"
                required
                placeholder="Pressure canner and surrounding station"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Sanitizer Agent</label>
              <input
                name="chemicals"
                required
                placeholder="200ppm chlorine sanitizing solution"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Frequency</label>
              <input
                name="frequency"
                required
                placeholder="Daily, after each use"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Responsible role</label>
              <input
                name="responsibleRole"
                required
                placeholder="Sanitation crew"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Risk level</label>
              <select
                name="riskLevel"
                required
                defaultValue="MEDIUM"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Applies to</label>
              <select
                name="appliesTo"
                required
                defaultValue="BOTH"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="BOTH">Every day</option>
                <option value="COOKING">Cooking Day only</option>
                <option value="JAR_FILLING">Jar Filling Day only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Due</label>
              <select
                name="timing"
                required
                defaultValue="ANYTIME"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="ANYTIME">Anytime (shown after any punch)</option>
                <option value="PRE_COOKING">Before lunch (must finish to start break)</option>
                <option value="POST_COOKING">After cooking (must finish to Time Out)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Bonus ₱ (optional)</label>
              <input
                name="bonusAmount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="50"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">
                Not shown at the kiosk. Whoever does it earns this once you pass the inspection.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Step-by-step procedure</label>
              <textarea
                name="steps"
                required
                rows={4}
                placeholder={"1. Rinse with clean water\n2. Apply sanitizing solution\n3. Let stand 2 minutes\n4. Rinse and air dry"}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Button>+ Add Procedure</Button>
            </div>
          </form>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Schedule</h2>
        <div className="flex flex-wrap items-center gap-3">
          {pendingChecks > 0 && (
            <form action={passAllSanitationAssignments}>
              <input type="hidden" name="date" value={date} />
              <button
                className="rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-1.5"
                title="Passes every duty that is done and waiting for inspection"
              >
                Pass all ({pendingChecks} waiting)
              </button>
            </form>
          )}
          <form method="get" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm"
            />
            <Button size="sm">Go</Button>
          </form>
        </div>
      </div>

      <Card padded>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-1 pr-2 font-normal">Employee</th>
                <th className="py-1 pr-2 font-normal">Procedure</th>
                <th className="py-1 pr-2 font-normal">Status</th>
                <th className="py-1 pr-2 font-normal">Inspection</th>
                <th className="py-1 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-2">
                    {a.employee ? (
                      <>
                        {a.employee.name}
                        {a.completedAt && (
                          <span className="text-slate-400 text-xs block">
                            {formatInTimeZone(a.completedAt, TIMEZONE, "h:mm a")}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 italic">Unassigned — team</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1.5">
                      <RiskDot level={a.procedure.riskLevel} />
                      {a.procedure.name}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Badge status={a.status === "DONE" ? "done" : "pendingTask"} />
                  </td>
                  <td className="py-1.5 pr-2 relative">
                    {a.inspectionResult ? (
                      <div>
                        <Badge status={a.inspectionResult === "PASS" ? "pass" : "fail"}>
                          {a.inspectionResult === "PASS" ? "Passed" : "Failed"}
                        </Badge>
                        {a.inspectionNote && (
                          <p className="text-xs text-slate-400 mt-1">{a.inspectionNote}</p>
                        )}
                      </div>
                    ) : a.status === "DONE" ? (
                      <InspectForm assignmentId={a.id} />
                    ) : (
                      <span className="text-slate-300 text-xs">Not done yet</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    {!a.inspectionResult && (
                      <form action={deleteSanitationAssignment}>
                        <input type="hidden" name="assignmentId" value={a.id} />
                        <button className="text-red-600 hover:underline text-xs">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    No assignments for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          action={assignSanitation}
          className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
        >
          <input type="hidden" name="date" value={date} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Procedure</label>
            <select
              name="procedureId"
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button>Assign</Button>
          <p className="text-xs text-slate-400 w-full">
            No need to pick who — any active employee can claim and complete this at the kiosk.
          </p>
        </form>
      </Card>

      <Card padded className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Recent Sign-offs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-1 pr-2 font-normal">Date</th>
                <th className="py-1 pr-2 font-normal">Procedure</th>
                <th className="py-1 font-normal">Signed off by</th>
              </tr>
            </thead>
            <tbody>
              {recentSignoffs.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-500">
                    {formatInTimeZone(a.date, TIMEZONE, "yyyy-MM-dd")}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1.5">
                      <RiskDot level={a.procedure.riskLevel} />
                      {a.procedure.name}
                    </span>
                  </td>
                  <td className="py-1.5 text-slate-700">
                    {a.employee?.name}
                    {a.completedAt && (
                      <span className="text-slate-400 text-xs ml-1.5">
                        {formatInTimeZone(a.completedAt, TIMEZONE, "h:mm a")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {recentSignoffs.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-400">
                    No completed sanitation duties yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InspectForm({ assignmentId }: { assignmentId: string }) {
  return (
    <details>
      <summary className="text-xs text-slate-600 hover:underline cursor-pointer">
        Inspect
      </summary>
      <form
        action={inspectSanitationAssignment}
        className="absolute z-10 mt-1 bg-white shadow-lg rounded-md border border-slate-200 p-3 flex flex-col gap-2 w-64"
      >
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <div>
          <label className="block text-xs text-slate-500">Result</label>
          <select
            name="result"
            required
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="PASS">Pass</option>
            <option value="FAIL">Fail</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Note (optional)</label>
          <input
            name="note"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <Button size="sm">Save Inspection</Button>
      </form>
    </details>
  );
}

function EditProcedureForm({
  procedure,
}: {
  procedure: {
    id: string;
    name: string;
    areaEquipment: string;
    chemicals: string;
    steps: string;
    frequency: string;
    responsibleRole: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    appliesTo: "COOKING" | "JAR_FILLING" | "BOTH";
    timing: "PRE_COOKING" | "POST_COOKING" | "ANYTIME";
    bonusAmount: number | null;
  };
}) {
  return (
    <details className="mt-2">
      <summary className="text-xs text-slate-600 hover:underline cursor-pointer">
        Edit
      </summary>
      <form action={updateProcedure} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <input type="hidden" name="id" value={procedure.id} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Name</label>
          <input
            name="name"
            required
            defaultValue={procedure.name}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Area / Equipment</label>
          <input
            name="areaEquipment"
            required
            defaultValue={procedure.areaEquipment}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Sanitizer Agent</label>
          <input
            name="chemicals"
            required
            defaultValue={procedure.chemicals}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Frequency</label>
          <input
            name="frequency"
            required
            defaultValue={procedure.frequency}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Responsible role</label>
          <input
            name="responsibleRole"
            required
            defaultValue={procedure.responsibleRole}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Risk level</label>
          <select
            name="riskLevel"
            required
            defaultValue={procedure.riskLevel}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Applies to</label>
          <select
            name="appliesTo"
            required
            defaultValue={procedure.appliesTo}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="BOTH">Every day</option>
            <option value="COOKING">Cooking Day only</option>
            <option value="JAR_FILLING">Jar Filling Day only</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Due</label>
          <select
            name="timing"
            required
            defaultValue={procedure.timing}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="ANYTIME">Anytime (shown after any punch)</option>
            <option value="PRE_COOKING">Before lunch (must finish to start break)</option>
            <option value="POST_COOKING">After cooking (must finish to Time Out)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Bonus ₱ (optional)</label>
          <input
            name="bonusAmount"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={procedure.bonusAmount ?? ""}
            placeholder="50"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Step-by-step procedure</label>
          <textarea
            name="steps"
            required
            rows={4}
            defaultValue={procedure.steps}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <Button size="sm">Save Changes</Button>
        </div>
      </form>
    </details>
  );
}
