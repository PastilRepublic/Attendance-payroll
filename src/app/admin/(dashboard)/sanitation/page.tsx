import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import {
  assignSanitation,
  createProcedure,
  deleteSanitationAssignment,
  inspectSanitationAssignment,
  passAllSanitationAssignments,
  resetSanitationDay,
  setMonthlyCleaningDate,
  setProcedureActive,
  setSanitationPhotoRequired,
  setWeeklyCleaningDay,
  updateProcedure,
} from "./actions";
import { auth } from "@/lib/auth";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import RiskDot from "@/components/RiskDot";
import SanitationProgressCard from "@/components/SanitationProgressCard";
import SanitationReminderCard from "@/components/SanitationReminderCard";
import {
  ensureTodaysSanitationSchedule,
  getSanitationSettings,
  getUpcomingSanitation,
  todayManila,
} from "@/lib/sanitation";
import { getOperationDay } from "@/lib/settings";
import {
  DEFAULT_WEEKLY_CLEANING_DAY,
  WEEKDAY_NAMES,
  datesInMonth,
  formatDateKey,
  monthlyCleaningDateFor,
  reminderDateFor,
} from "@/lib/sanitationSchedule";
import {
  SCHEDULE_LABELS,
  TIMING_LABELS,
  TIMING_RANK,
  type SanitationScheduleKey,
} from "@/lib/sanitationLabels";
import AutoSubmitDate from "./AutoSubmitDate";
import AutoSubmitSelect from "./AutoSubmitSelect";
import ProductionDayFields from "./ProductionDayFields";
import TaskDialog, { DialogCancelButton } from "./TaskDialog";

const SCOPE_LABELS: Record<"COOKING" | "JAR_FILLING" | "BOTH", string> = {
  COOKING: "Cooking",
  JAR_FILLING: "Jar filling",
  BOTH: "Cooking & Jar filling",
};

const SCHEDULE_ORDER: Record<SanitationScheduleKey, number> = { DAILY: 0, WEEKLY: 1, MONTHLY: 2 };

const FIELD_CLASS =
  "w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400";
const LABEL_CLASS = "mb-1.5 block text-base font-semibold text-slate-900";
const PILL_BUTTON = "inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-200";

type Procedure = Awaited<ReturnType<typeof prisma.sanitationProcedure.findMany>>[number];

export default async function SanitationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const isOwner = (await auth())?.user?.role === "OWNER";
  const today = todayManila();
  const date = params.date ?? today;
  if (date === today) {
    await ensureTodaysSanitationSchedule();
  }

  const [operationDay, settings] = await Promise.all([getOperationDay(), getSanitationSettings()]);

  const [procedures, assignments, recentSignoffs, upcoming] = await Promise.all([
    prisma.sanitationProcedure.findMany({ orderBy: { name: "asc" } }),
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
    getUpcomingSanitation(today, operationDay, settings),
  ]);

  const activeProcedures = procedures
    .filter((p) => p.active)
    .sort(
      (a, b) =>
        SCHEDULE_ORDER[a.schedule] - SCHEDULE_ORDER[b.schedule] ||
        TIMING_RANK[a.timing] - TIMING_RANK[b.timing] ||
        a.name.localeCompare(b.name)
    );
  const inactiveProcedures = procedures.filter((p) => !p.active);

  const sortedAssignments = [...assignments].sort(
    (a, b) => TIMING_RANK[a.procedure.timing] - TIMING_RANK[b.procedure.timing]
  );
  const hasProgress = assignments.some((a) => a.status !== "PENDING" || a.inspectionResult);
  const pendingChecks = assignments.filter((a) => a.status === "DONE" && !a.inspectionResult).length;

  return (
    <div>
      <PageHeader title="Sanitation" description="Cleaning tasks, the daily checklist, and inspection sign-offs." />

      <div className="space-y-6">
        {assignments.length > 0 && <SanitationProgressCard tasks={assignments} />}

        <CleaningSettingsCard
          today={today}
          settings={settings}
          monthlyDueDate={upcoming.monthly.dueDate}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SanitationReminderCard
            schedule="WEEKLY"
            count={upcoming.weekly.tasks.length}
            dueDate={upcoming.weekly.dueDate}
            reminderDate={upcoming.weekly.reminderDate}
            phase={upcoming.weekly.phase}
          />
          <SanitationReminderCard
            schedule="MONTHLY"
            count={upcoming.monthly.tasks.length}
            dueDate={upcoming.monthly.dueDate}
            reminderDate={upcoming.monthly.reminderDate}
            phase={upcoming.monthly.phase}
          />
        </div>

        <section className="rounded-3xl border border-slate-300 bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sanitation tasks</h2>
          <p className="mt-1 text-base text-slate-500">
            Add or update tasks here. Inactive tasks stay saved but are hidden from employees.
          </p>

          <div className="mt-5">
            <TaskDialog
              title="Add sanitation task"
              description="Keep the instruction short and specific so any available employee can follow it."
              triggerLabel={
                <>
                  <span aria-hidden className="text-xl leading-none">+</span> Add task
                </>
              }
              triggerClassName="inline-flex items-center gap-2 rounded-full bg-accent-800 px-6 py-3 text-base font-semibold text-white hover:bg-accent-900"
            >
              <TaskForm action={createProcedure} submitLabel="Add task" />
            </TaskDialog>
          </div>

          <ul className="mt-6 space-y-4">
            {activeProcedures.map((p) => (
              <TaskCard key={p.id} procedure={p} />
            ))}
            {activeProcedures.length === 0 && (
              <li className="rounded-3xl border border-dashed border-slate-300 px-6 py-10 text-center text-slate-400">
                No tasks yet — add one to start the checklist.
              </li>
            )}
          </ul>

          {inactiveProcedures.length > 0 && (
            <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-700">
                Inactive tasks ({inactiveProcedures.length})
              </summary>
              <ul className="space-y-2 px-5 pb-4">
                {inactiveProcedures.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600">
                      {p.name}
                      <span className="ml-2 text-xs text-slate-400">{SCHEDULE_LABELS[p.schedule]}</span>
                    </span>
                    <form action={setProcedureActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value="true" />
                      <button className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                        Reactivate
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 mt-8">
        <h2 className="text-sm font-semibold text-slate-700">Checklist log</h2>
        <div className="flex flex-wrap items-center gap-3">
          {pendingChecks > 0 && (
            <form action={passAllSanitationAssignments}>
              <input type="hidden" name="date" value={date} />
              <button
                className="rounded-md bg-green-600 hover:bg-green-500 text-white text-xs font-medium px-3 py-1.5"
                title="Passes every duty that is done and waiting for inspection"
              >
                Pass all ({pendingChecks} waiting)
              </button>
            </form>
          )}
          {isOwner && hasProgress && (
            <form action={resetSanitationDay}>
              <input type="hidden" name="date" value={date} />
              <ConfirmSubmitButton
                message={`Reset the cleaning checklist for ${date}? Every duty goes back to Pending and its sign-off and inspection are cleared.`}
                title="Sets every duty on this date back to Pending"
                className="rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium px-3 py-1.5"
              >
                Reset this day
              </ConfirmSubmitButton>
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
              {sortedAssignments.map((a) => (
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
                    <span className="block text-xs text-slate-400">
                      {TIMING_LABELS[a.procedure.timing]}
                      {a.procedure.schedule !== "DAILY" && ` · ${SCHEDULE_LABELS[a.procedure.schedule]}`}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Badge status={a.status === "DONE" ? "done" : "pendingTask"} />
                    {a.photoUrl && (
                      <a
                        href={`/api/admin/punch-photo/${a.photoUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs text-amber-700 hover:underline"
                      >
                        View photo proof
                      </a>
                    )}
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
              {activeProcedures.map((p) => (
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

/** Photo-proof switch, weekly cleaning day and monthly cleaning date. */
function CleaningSettingsCard({
  today,
  settings,
  monthlyDueDate,
}: {
  today: string;
  settings: Awaited<ReturnType<typeof getSanitationSettings>>;
  monthlyDueDate: string;
}) {
  const weekdayName = WEEKDAY_NAMES[settings.weeklyDay - 1];
  const monthPrefix = monthlyDueDate.slice(0, 7);
  const overrideInMonth = settings.monthlyOverride?.startsWith(monthPrefix) ? settings.monthlyOverride : null;
  const defaultMonthly = monthlyCleaningDateFor(monthlyDueDate, settings.weeklyDay, null);
  const monthDates = datesInMonth(monthlyDueDate);
  // The calendar only offers days of the month still to come.
  const minDate = today > monthDates[0] ? today : monthDates[0];
  const maxDate = monthDates[monthDates.length - 1];
  const pickedDate = overrideInMonth ?? defaultMonthly;
  const on = settings.photoRequired;

  return (
    <section className="rounded-3xl border border-slate-300 bg-white p-6 sm:p-8">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Cleaning settings</h2>
      <p className="mt-1 text-base text-slate-500">Set how the kiosk checklist works before employees start.</p>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-300 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-lg font-bold text-slate-900">Supervisor unavailable</p>
          <p className="mt-0.5 text-base text-slate-600">
            Require photo proof for tasks submitted at the kiosk. Stays on until you turn it off.
          </p>
        </div>
        <form action={setSanitationPhotoRequired}>
          <input type="hidden" name="photoRequired" value={String(!on)} />
          <button
            role="switch"
            aria-checked={on}
            aria-label="Supervisor unavailable"
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-orange-500" : "bg-slate-300"}`}
          >
            <span
              className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                on ? "translate-x-6" : ""
              }`}
            />
          </button>
        </form>
      </div>

      <form action={setWeeklyCleaningDay} className="mt-6">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor="weeklyDay" className="text-base font-semibold text-slate-900">
            Weekly cleaning day
          </label>
          <span className="rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700">
            Default: {WEEKDAY_NAMES[DEFAULT_WEEKLY_CLEANING_DAY - 1]}
          </span>
        </div>
        <AutoSubmitSelect
          name="weeklyDay"
          defaultValue={String(settings.weeklyDay)}
          className="w-full rounded-2xl border-2 border-slate-900 bg-white px-5 py-3.5 text-lg text-slate-900"
        >
          {WEEKDAY_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </AutoSubmitSelect>
      </form>

      <div className="mt-6 rounded-2xl border border-slate-300 bg-slate-50 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label htmlFor="monthlyDate" className="text-lg font-bold text-slate-900">
            Monthly cleaning date
          </label>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              overrideInMonth ? "bg-slate-200 text-slate-700" : "bg-accent-100 text-accent-900"
            }`}
          >
            {overrideInMonth ? "Custom date" : `Last ${weekdayName} default`}
          </span>
        </div>
        <form action={setMonthlyCleaningDate}>
          <AutoSubmitDate
            key={pickedDate}
            name="monthlyDate"
            defaultValue={pickedDate}
            min={minDate}
            max={maxDate}
            className="w-full cursor-pointer rounded-2xl border border-slate-300 bg-slate-100 px-5 py-3.5 text-lg text-slate-900"
          />
        </form>
        {overrideInMonth && (
          <form action={setMonthlyCleaningDate} className="mt-2">
            <input type="hidden" name="monthlyDate" value="" />
            <button className="text-sm font-semibold text-accent-800 hover:underline">
              Use the default (last {weekdayName}, {formatDateKey(defaultMonthly, "MMM d")})
            </button>
          </form>
        )}
        <p className="mt-3 text-base text-slate-600">
          Reminder: {formatDateKey(reminderDateFor(monthlyDueDate), "EEEE, MMM d")}
        </p>
      </div>
    </section>
  );
}

function TaskCard({ procedure }: { procedure: Procedure }) {
  return (
    <li className="rounded-3xl border border-slate-300 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-bold text-slate-900">{procedure.name}</h3>
        <span className="rounded-full border border-slate-300 px-3 py-0.5 text-sm font-medium text-slate-700">
          {SCHEDULE_LABELS[procedure.schedule].toLowerCase()}
        </span>
      </div>
      <p className="mt-3 text-base text-slate-700 whitespace-pre-wrap">{procedure.steps}</p>
      <p className="mt-3 text-sm font-semibold text-slate-900">
        {TIMING_LABELS[procedure.timing]} · {SCOPE_LABELS[procedure.appliesTo]}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Sanitizer: {procedure.chemicals} · {procedure.riskLevel.toLowerCase()} risk
        {procedure.bonusAmount && (
          <span className="text-amber-700"> · ₱{Number(procedure.bonusAmount).toFixed(2)} bonus</span>
        )}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <TaskDialog
          title="Edit sanitation task"
          description="Keep the instruction short and specific so any available employee can follow it."
          triggerLabel={
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.9 3.6 3.5 3.5M4 20l1-4.3L17.4 3.3a1.5 1.5 0 0 1 2.1 0l1.2 1.2a1.5 1.5 0 0 1 0 2.1L8.3 19 4 20Z" />
              </svg>
              Edit
            </>
          }
          triggerClassName={PILL_BUTTON}
        >
          <TaskForm action={updateProcedure} submitLabel="Save changes" procedure={procedure} />
        </TaskDialog>
        <form action={setProcedureActive}>
          <input type="hidden" name="id" value={procedure.id} />
          <input type="hidden" name="active" value="false" />
          <button className={PILL_BUTTON}>Deactivate</button>
        </form>
      </div>
    </li>
  );
}

function TaskForm({
  action,
  submitLabel,
  procedure,
}: {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  procedure?: Procedure;
}) {
  return (
    <form action={action} className="mt-6 space-y-5">
      {procedure && <input type="hidden" name="id" value={procedure.id} />}
      <div>
        <label className={LABEL_CLASS}>Task name</label>
        <input
          name="name"
          required
          defaultValue={procedure?.name}
          placeholder="Pressure Canner Sanitization"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label className={LABEL_CLASS}>Cleaning instruction</label>
        <textarea
          name="steps"
          required
          rows={4}
          defaultValue={procedure?.steps}
          placeholder="Clear scraps, wash, rinse, sanitize, then air-dry."
          className={`${FIELD_CLASS} bg-white`}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Schedule</label>
          <select name="schedule" defaultValue={procedure?.schedule ?? "DAILY"} className={FIELD_CLASS}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>When shown</label>
          <select name="timing" defaultValue={procedure?.timing ?? "ANYTIME"} className={FIELD_CLASS}>
            <option value="PRE_COOKING">Before lunch (must finish to start break)</option>
            <option value="ANYTIME">Anytime (shown after any punch)</option>
            <option value="POST_COOKING">End of shift (must finish to time out)</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Sanitizer agent</label>
          <input
            name="chemicals"
            required
            defaultValue={procedure?.chemicals}
            placeholder="Zonrox"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Risk level</label>
          <select name="riskLevel" defaultValue={procedure?.riskLevel ?? "MEDIUM"} className={FIELD_CLASS}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Bonus ₱ (optional)</label>
        <input
          name="bonusAmount"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={procedure?.bonusAmount ? Number(procedure.bonusAmount) : ""}
          placeholder="50"
          className={FIELD_CLASS}
        />
        <p className="mt-1 text-sm text-slate-500">
          Not shown at the kiosk. Whoever does it earns this once you pass the inspection.
        </p>
      </div>
      <ProductionDayFields
        defaultCooking={procedure ? procedure.appliesTo !== "JAR_FILLING" : true}
        defaultJarFilling={procedure ? procedure.appliesTo !== "COOKING" : true}
      />
      <div className="flex items-center justify-end gap-3 pt-2">
        <DialogCancelButton className="rounded-full border border-slate-300 bg-slate-100 px-6 py-3 text-base font-semibold text-slate-800 hover:bg-slate-200" />
        <button className="rounded-full bg-accent-800 px-6 py-3 text-base font-semibold text-white hover:bg-accent-900">
          {submitLabel}
        </button>
      </div>
    </form>
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
