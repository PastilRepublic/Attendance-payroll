"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";

type PresenceStatus = "OUT" | "WORKING" | "ON_BREAK" | "DONE";
type OperationDay = "COOKING" | "JAR_FILLING";

interface EmployeeOption {
  id: string;
  name: string;
  photoUrl: string | null;
  status: PresenceStatus;
  roleTag: string | null;
}

const EMPLOYEE_POLL_MS = 15000;
const CLOCK_TICK_MS = 1000;

const OPERATION_LABELS: Record<OperationDay, string> = {
  COOKING: "Cooking Day",
  JAR_FILLING: "Jar Filling Day",
};

const OPERATION_TEXT_STYLES: Record<OperationDay, string> = {
  COOKING: "text-orange-600",
  JAR_FILLING: "text-green-600",
};

const PRESENCE_DOT_STYLES: Record<PresenceStatus, string> = {
  OUT: "bg-slate-300",
  WORKING: "bg-green-500",
  ON_BREAK: "bg-amber-500",
  DONE: "bg-sky-500",
};

const AVATAR_COLORS = [
  "bg-orange-100 text-orange-700",
  "bg-sky-100 text-sky-700",
  "bg-pink-100 text-pink-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function OperationDayToggle({
  value,
  onToggle,
}: {
  value: OperationDay;
  onToggle: () => void;
}) {
  const trackClass =
    value === "COOKING"
      ? "bg-orange-50 border-orange-200"
      : "bg-green-50 border-green-200";
  const thumbClass = value === "COOKING" ? "bg-orange-500" : "bg-green-500";

  return (
    <button
      onClick={onToggle}
      aria-label="Toggle today's operation"
      className={`relative inline-flex h-8 w-44 items-center rounded-full border transition-colors ${trackClass}`}
    >
      <span
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full shadow transition-transform ${thumbClass} ${
          value === "JAR_FILLING" ? "translate-x-full" : "translate-x-0"
        }`}
      />
      <span
        className={`relative z-10 w-1/2 text-center text-xs font-medium ${
          value === "COOKING" ? "text-white" : "text-orange-400"
        }`}
      >
        Cooking
      </span>
      <span
        className={`relative z-10 w-1/2 text-center text-xs font-medium ${
          value === "JAR_FILLING" ? "text-white" : "text-green-500"
        }`}
      >
        Jar Filling
      </span>
    </button>
  );
}

export default function HomeKiosk() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesFailed, setEmployeesFailed] = useState(false);
  // Which of the two nav links is "on" -- the home page is employee-facing,
  // so Employee starts highlighted. Clicking either swaps which one is lit
  // up, right as the click happens (just before the link navigates away).
  const [activeNav, setActiveNav] = useState<"employee" | "admin">("employee");
  // Seeded as null (not `new Date()`) so the server-rendered HTML and the
  // client's first render agree -- this page is statically prerendered, so
  // baking in a real timestamp during render would drift from the client's
  // actual clock and break hydration. The real clock only starts ticking
  // client-side, from the effect below.
  const [now, setNow] = useState<Date | null>(null);
  const [operationDay, setOperationDay] = useState<OperationDay | null>(null);
  const [togglingDay, setTogglingDay] = useState(false);

  const refreshEmployees = useCallback(() => {
    fetch("/api/kiosk/employees")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setEmployees(Array.isArray(data.employees) ? data.employees : []);
        setEmployeesFailed(false);
      })
      .catch(() => setEmployeesFailed(true));
  }, []);

  useEffect(() => {
    refreshEmployees();
    const interval = setInterval(refreshEmployees, EMPLOYEE_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshEmployees]);

  useEffect(() => {
    fetch("/api/kiosk/operation-day")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setOperationDay(data.operationDay === "JAR_FILLING" ? "JAR_FILLING" : "COOKING"))
      .catch(() => setOperationDay("COOKING"));
  }, []);

  useEffect(() => {
    const tick = () => setNow(new Date());
    // Kick off the first tick asynchronously (not a direct setState call in
    // the effect body) so the clock fills in almost immediately instead of
    // waiting a full CLOCK_TICK_MS for the interval's first fire.
    const kickoff = setTimeout(tick, 0);
    const interval = setInterval(tick, CLOCK_TICK_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, []);

  const toggleOperationDay = useCallback(() => {
    if (!operationDay || togglingDay) return;
    const next: OperationDay = operationDay === "COOKING" ? "JAR_FILLING" : "COOKING";
    setOperationDay(next);
    setTogglingDay(true);
    fetch("/api/kiosk/operation-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationDay: next }),
    })
      .catch(() => {})
      .finally(() => setTogglingDay(false));
  }, [operationDay, togglingDay]);

  const dateLabel = now ? formatInTimeZone(now, TIMEZONE, "EEEE, d MMM") : "";
  const timeLabel = now ? formatInTimeZone(now, TIMEZONE, "h:mm a") : "";

  return (
    <div className="flex-1 flex flex-col bg-white text-slate-900 min-h-0">
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold text-base sm:text-lg">
            P
          </span>
          <div className="min-w-0">
            <p className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-slate-900 leading-tight truncate">
              The Famous Pastil Republic
            </p>
            <p className="text-[9px] sm:text-[10px] font-semibold tracking-widest text-slate-400 truncate">
              ATTENDANCE &amp; PAYROLL
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Link
            href="/employee"
            onClick={() => setActiveNav("employee")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-sm font-medium transition-colors ${
              activeNav === "employee"
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
            </svg>
            <span className="hidden sm:inline">Employee</span>
          </Link>
          <Link
            href="/admin"
            onClick={() => setActiveNav("admin")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-sm font-medium transition-colors ${
              activeNav === "admin"
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4.5 6v5.25c0 4.83 3.24 8.94 7.5 9.75 4.26-.81 7.5-4.92 7.5-9.75V6L12 3Z" />
            </svg>
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col items-center justify-start gap-4 p-4 lg:p-6 text-center">
          <div className="w-full">
            <p className="text-sm text-slate-500">{dateLabel}</p>
            <p className="text-2xl lg:text-3xl font-semibold text-slate-900 tabular-nums">{timeLabel}</p>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-h-0">
          {operationDay && (
            <>
              {/* Kiosk-size (lg+) view: original stacked eyebrow + headline + toggle */}
              <div className="hidden lg:flex lg:flex-col lg:items-center lg:text-center gap-2 px-4 py-4 border-b border-slate-200">
                <p className="text-[11px] font-semibold tracking-widest text-slate-400">
                  TODAY&apos;S OPERATION
                </p>
                <p className={`text-base font-bold ${OPERATION_TEXT_STYLES[operationDay]}`}>
                  {OPERATION_LABELS[operationDay]}
                </p>
                <OperationDayToggle value={operationDay} onToggle={toggleOperationDay} />
              </div>

              {/* Smaller screens: original compact single-row version */}
              <div className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
                <span className={`text-sm font-semibold ${OPERATION_TEXT_STYLES[operationDay]}`}>
                  {OPERATION_LABELS[operationDay]}
                </span>
                <OperationDayToggle value={operationDay} onToggle={toggleOperationDay} />
              </div>
            </>
          )}

          <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6">
            <div className="max-w-xl mx-auto">
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {employees.length === 0 && !employeesFailed && (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">Loading employees…</p>
                )}
                {employeesFailed && (
                  <p className="px-4 py-6 text-sm text-red-500 text-center">
                    Could not load the employee list. Try again shortly.
                  </p>
                )}
                {employees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => router.push(`/kiosk?employee=${emp.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="relative shrink-0">
                      {emp.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={emp.photoUrl}
                          alt={emp.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${avatarColor(emp.name)}`}
                        >
                          {emp.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${PRESENCE_DOT_STYLES[emp.status]}`}
                      />
                    </span>
                    <span className="text-base font-medium text-slate-900">
                      {emp.name}
                      {emp.roleTag && <span className="text-slate-400 font-normal"> ({emp.roleTag})</span>}
                    </span>
                  </button>
                ))}
              </div>

              <Link
                href="/sanitation"
                className="mt-4 flex items-center gap-3 rounded-xl border-2 border-amber-200 hover:border-amber-400 bg-white shadow-sm hover:shadow-md transition px-4 py-4"
              >
                <span className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 text-amber-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Sanitation Inspection &amp; Schedule
                  </span>
                  <span className="block text-xs text-slate-500">Who&apos;s in charge of what today</span>
                </span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
