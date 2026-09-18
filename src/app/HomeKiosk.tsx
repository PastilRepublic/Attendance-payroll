"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function HomeKiosk() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesFailed, setEmployeesFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => new Date());
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
    const t = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(t);
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

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, search]);

  const dateLabel = formatInTimeZone(now, TIMEZONE, "EEEE, d MMM");
  const timeLabel = formatInTimeZone(now, TIMEZONE, "h:mm a");

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-white text-slate-900 min-h-0">
      <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-row lg:flex-col items-center lg:items-stretch justify-between lg:justify-start gap-4 p-4 lg:p-6">
        <div>
          <p className="text-lg lg:text-xl font-bold tracking-tight text-slate-900">
            The Famous Pastil Republic
          </p>
          <p className="text-[11px] font-semibold tracking-widest text-slate-400 mt-0.5">KIOSK</p>
        </div>

        <div className="text-right lg:text-left lg:mt-8">
          <p className="text-sm text-slate-500">{dateLabel}</p>
          <p className="text-2xl lg:text-3xl font-semibold text-slate-900 tabular-nums">{timeLabel}</p>
        </div>

        <div className="hidden lg:block lg:mt-auto">
          <p className="text-[11px] font-semibold tracking-widest text-slate-400 mb-2">
            TODAY&apos;S OPERATION
          </p>
          {operationDay && (
            <>
              <p className="text-base font-bold text-slate-900 mb-2">
                {OPERATION_LABELS[operationDay]}
              </p>
              <button
                onClick={toggleOperationDay}
                aria-label="Toggle today's operation"
                className="relative inline-flex h-8 w-44 items-center rounded-full bg-slate-100 border border-slate-200"
              >
                <span
                  className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow transition-transform ${
                    operationDay === "JAR_FILLING" ? "translate-x-full" : "translate-x-0"
                  }`}
                />
                <span
                  className={`relative z-10 w-1/2 text-center text-xs font-medium ${
                    operationDay === "COOKING" ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  Cooking
                </span>
                <span
                  className={`relative z-10 w-1/2 text-center text-xs font-medium ${
                    operationDay === "JAR_FILLING" ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  Jar Filling
                </span>
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-end gap-2 px-4 lg:px-6 py-3 border-b border-slate-200">
          <Link
            href="/employee"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
            </svg>
            Employee
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4.5 6v5.25c0 4.83 3.24 8.94 7.5 9.75 4.26-.81 7.5-4.92 7.5-9.75V6L12 3Z" />
            </svg>
            Admin
          </Link>
        </div>

        {/* Operation-day toggle on small screens, where the sidebar row hides it */}
        {operationDay && (
          <div className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
            <span className="text-sm font-semibold text-slate-900">{OPERATION_LABELS[operationDay]}</span>
            <button
              onClick={toggleOperationDay}
              aria-label="Toggle today's operation"
              className="relative inline-flex h-8 w-44 items-center rounded-full bg-slate-100 border border-slate-200"
            >
              <span
                className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow transition-transform ${
                  operationDay === "JAR_FILLING" ? "translate-x-full" : "translate-x-0"
                }`}
              />
              <span
                className={`relative z-10 w-1/2 text-center text-xs font-medium ${
                  operationDay === "COOKING" ? "text-slate-900" : "text-slate-400"
                }`}
              >
                Cooking
              </span>
              <span
                className={`relative z-10 w-1/2 text-center text-xs font-medium ${
                  operationDay === "JAR_FILLING" ? "text-slate-900" : "text-slate-400"
                }`}
              >
                Jar Filling
              </span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6">
          <div className="max-w-xl mx-auto">
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your name…"
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="mt-5 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {employees.length === 0 && !employeesFailed && (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">Loading employees…</p>
              )}
              {employeesFailed && (
                <p className="px-4 py-6 text-sm text-red-500 text-center">
                  Could not load the employee list. Try again shortly.
                </p>
              )}
              {filteredEmployees.map((emp) => (
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
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <span
                        className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold ${avatarColor(emp.name)}`}
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
              {employees.length > 0 && filteredEmployees.length === 0 && (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">No employee matches &quot;{search}&quot;.</p>
              )}
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
  );
}
