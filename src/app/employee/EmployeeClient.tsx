"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";

interface EmployeeOption {
  id: string;
  name: string;
}

interface AttendanceDay {
  date: string;
  timeIn: string | null;
  breakIn: string | null;
  breakOut: string | null;
  timeOut: string | null;
  regularHours: number;
  overtimeHours: number;
  isLate: boolean;
  isUndertime: boolean;
  returnedLateFromBreak: boolean;
  dayStatus: "PAID_LEAVE" | "UNPAID_ABSENCE" | null;
}

interface PayslipAdjustment {
  label: string;
  amount: number;
  note: string | null;
}

interface Payslip {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "FINALIZED";
  regularHours: number;
  daysWorked: number;
  absentDays: number;
  lateCount: number;
  lateMinutes: number;
  overtimeHours: number;
  grossPay: number;
  adjustments: PayslipAdjustment[];
  adjustmentsTotal: number;
  totalPay: number;
}

type Screen = "selectName" | "pin" | "dashboard";
type Tab = "attendance" | "payslips";

function formatLate(minutes: number) {
  const m = Math.round(minutes);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Same palette as the admin Attendance page, so the same weekday reads the
// same color everywhere -- warmer toward the weekend, easy to pattern-match.
const DAY_ABBREV_STYLES = [
  { label: "Sun", className: "bg-red-100 text-red-700" },
  { label: "Mon", className: "bg-indigo-100 text-indigo-700" },
  { label: "Tue", className: "bg-fuchsia-100 text-fuchsia-700" },
  { label: "Wed", className: "bg-emerald-100 text-emerald-700" },
  { label: "Thu", className: "bg-cyan-100 text-cyan-700" },
  { label: "Fri", className: "bg-yellow-100 text-yellow-800" },
  { label: "Sat", className: "bg-orange-100 text-orange-700" },
] as const;

function dayAbbrev(dateStr: string): { label: string; className: string } {
  const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  return DAY_ABBREV_STYLES[dow];
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
}

/** Monday of the week containing this date -- payroll weeks run Mon-Sun. */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return addDaysStr(dateStr, -((d.getUTCDay() + 6) % 7));
}

/** Last day (1-31) of a YYYY-MM month string, via plain calendar math. */
function daysInMonth(month: string): number {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
}

/** ISO week string (YYYY-Www) for the week containing this date. */
function isoWeekString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  // ISO weeks: Thursday of the week determines the week-year.
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of a given ISO week string (YYYY-Www). */
function mondayOfIsoWeek(weekStr: string): string {
  const [yearStr, weekPart] = weekStr.split("-W");
  const year = Number(yearStr);
  const week = Number(weekPart);
  const jan4 = new Date(Date.UTC(year, 0, 4)); // Jan 4 is always in ISO week 1
  const week1Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000).toISOString().slice(0, 10);
}

type RangeKind = "day" | "week" | "month";

export default function EmployeeClient() {
  const [screen, setScreen] = useState<Screen>("selectName");
  const [tab, setTab] = useState<Tab>("attendance");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesFailed, setEmployeesFailed] = useState(false);
  const [selected, setSelected] = useState<EmployeeOption | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [days, setDays] = useState<AttendanceDay[] | null>(null);
  const [payslips, setPayslips] = useState<Payslip[] | null>(null);
  const [payBasis, setPayBasis] = useState<"HOURLY" | "DAILY">("HOURLY");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [earliestDate, setEarliestDate] = useState<string | null>(null);
  const [rangeKind, setRangeKind] = useState<RangeKind>("month");
  const [dayValue, setDayValue] = useState("");
  const [weekValue, setWeekValue] = useState("");
  const [monthValue, setMonthValue] = useState("");
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState(false);

  useEffect(() => {
    fetch("/api/kiosk/employees")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployeesFailed(true));
  }, []);

  async function submitPin(enteredPin: string, employee: EmployeeOption) {
    setChecking(true);
    setPinError(null);
    try {
      const [attRes, paySlipRes] = await Promise.all([
        fetch("/api/employee/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: enteredPin, employeeId: employee.id }),
        }),
        fetch("/api/employee/payslips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: enteredPin, employeeId: employee.id }),
        }),
      ]);

      if (attRes.status === 401 || paySlipRes.status === 401) {
        setPinError("PIN not recognized. Try again.");
        setPin("");
        setChecking(false);
        return;
      }
      if (!attRes.ok || !paySlipRes.ok) {
        setLoadError("Something went wrong loading your data. Please try again.");
        setChecking(false);
        return;
      }

      const attData = await attRes.json();
      const payData = await paySlipRes.json();
      setEmployeeName(attData.employeeName ?? employee.name);
      setDays(attData.days ?? []);
      if (typeof attData.today === "string") {
        setToday(attData.today);
        setDayValue(attData.today);
        setWeekValue(isoWeekString(attData.today));
        setMonthValue(attData.today.slice(0, 7));
      }
      setEarliestDate(attData.earliestDate ?? null);
      setRangeKind("month");
      setPayslips(payData.payslips ?? []);
      setPayBasis(payData.payBasis === "DAILY" ? "DAILY" : "HOURLY");
      setScreen("dashboard");
    } catch {
      setLoadError("Could not reach the server. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  async function loadRange(start: string, end: string) {
    if (!selected || monthLoading) return;
    setMonthLoading(true);
    setMonthError(false);
    try {
      const res = await fetch("/api/employee/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, employeeId: selected.id, start, end }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDays(data.days ?? []);
    } catch {
      setMonthError(true);
    } finally {
      setMonthLoading(false);
    }
  }

  function handleDigit(d: string) {
    if (checking || pin.length >= 4 || !selected) return;
    setPin(pin + d);
  }

  function reset() {
    setScreen("selectName");
    setSelected(null);
    setPin("");
    setPinError(null);
    setEmployeeName(null);
    setDays(null);
    setPayslips(null);
    setLoadError(null);
    setToday(null);
    setEarliestDate(null);
    setRangeKind("month");
    setMonthError(false);
    setTab("attendance");
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-100">
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

      <div className="flex-1 flex items-start justify-center px-4 py-8">
        {screen === "selectName" && (
          <div className="w-full max-w-xl text-center">
            <p className="text-2xl font-semibold mb-6 text-slate-800">
              Employee Dashboard — Tap your name
            </p>
            {employees.length === 0 && !employeesFailed && (
              <p className="text-slate-500">Loading employees…</p>
            )}
            {employeesFailed && (
              <p className="text-red-600">Could not load the employee list. Please try again later.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelected(emp);
                    setPin("");
                    setPinError(null);
                    setScreen("pin");
                  }}
                  className="rounded-xl bg-white border border-slate-300 hover:bg-slate-50 px-5 py-5 text-lg font-semibold text-slate-800 shadow-sm"
                >
                  {emp.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {screen === "pin" && selected && (
          <div className="flex flex-col items-center">
            <p className="text-2xl font-semibold mb-1 text-slate-800">Hi, {selected.name}</p>
            <div className="flex items-center gap-3 mb-4">
              <p className="text-sm text-slate-500">Enter your PIN to view your dashboard</p>
              <button
                onClick={() => {
                  setScreen("selectName");
                  setSelected(null);
                  setPin("");
                  setPinError(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Not you? Choose again
              </button>
            </div>

            <div className="flex gap-3 mb-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-11 h-13 rounded-lg border-2 flex items-center justify-center text-2xl ${
                    i < pin.length ? "border-slate-800 bg-slate-100" : "border-slate-300"
                  }`}
                  style={{ height: "3.25rem" }}
                >
                  {i < pin.length ? "●" : ""}
                </div>
              ))}
            </div>

            {pinError && <p className="text-red-600 text-sm mb-3">{pinError}</p>}
            {loadError && <p className="text-red-600 text-sm mb-3">{loadError}</p>}

            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((d) => {
                if (d === "clear") {
                  return (
                    <button
                      key={d}
                      onClick={() => setPin("")}
                      disabled={checking}
                      className="w-20 h-20 rounded-xl bg-slate-200 hover:bg-slate-300 text-base font-medium text-slate-700 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  );
                }
                if (d === "back") {
                  return (
                    <button
                      key={d}
                      onClick={() => setPin((p) => p.slice(0, -1))}
                      disabled={checking}
                      className="w-20 h-20 rounded-xl bg-slate-200 hover:bg-slate-300 text-base font-medium text-slate-700 disabled:opacity-50"
                    >
                      ⌫
                    </button>
                  );
                }
                return (
                  <button
                    key={d}
                    onClick={() => handleDigit(d)}
                    disabled={checking}
                    className="w-20 h-20 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-2xl font-semibold text-slate-800 disabled:opacity-50"
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => selected && submitPin(pin, selected)}
              disabled={pin.length < 4 || checking}
              className="mt-5 w-64 h-14 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xl font-semibold"
            >
              {checking ? "Checking…" : "Enter"}
            </button>
          </div>
        )}

        {screen === "dashboard" && (
          <div className="w-full max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xl font-semibold text-slate-800">{employeeName}&apos;s Dashboard</p>
              <button
                onClick={reset}
                className="text-sm text-slate-500 hover:text-slate-800 underline"
              >
                Switch employee
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
              <div className="inline-flex gap-1 bg-slate-100 rounded-full p-1">
                <button
                  onClick={() => setTab("attendance")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    tab === "attendance"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Attendance History
                </button>
                <button
                  onClick={() => setTab("payslips")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    tab === "payslips"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Payslips
                </button>
              </div>
              {tab === "attendance" && today && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (rangeKind === "day" && dayValue) loadRange(dayValue, dayValue);
                    else if (rangeKind === "week" && weekValue) {
                      const monday = mondayOfIsoWeek(weekValue);
                      loadRange(monday, addDaysStr(monday, 6));
                    } else if (rangeKind === "month" && monthValue) {
                      loadRange(
                        `${monthValue}-01`,
                        `${monthValue}-${String(daysInMonth(monthValue)).padStart(2, "0")}`
                      );
                    }
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <select
                    value={rangeKind}
                    onChange={(e) => setRangeKind(e.target.value as RangeKind)}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-sm bg-white"
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                  {rangeKind === "month" ? (
                    <input
                      type="month"
                      value={monthValue}
                      onChange={(e) => setMonthValue(e.target.value)}
                      min={earliestDate?.slice(0, 7)}
                      max={today.slice(0, 7)}
                      required
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-sm bg-white"
                    />
                  ) : rangeKind === "week" ? (
                    <input
                      type="week"
                      value={weekValue}
                      onChange={(e) => setWeekValue(e.target.value)}
                      min={earliestDate ? isoWeekString(earliestDate) : undefined}
                      max={isoWeekString(today)}
                      required
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-sm bg-white"
                    />
                  ) : (
                    <input
                      type="date"
                      value={dayValue}
                      onChange={(e) => setDayValue(e.target.value)}
                      min={earliestDate ?? undefined}
                      max={today}
                      required
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-sm bg-white"
                    />
                  )}
                  <Button size="sm" disabled={monthLoading}>
                    Go
                  </Button>
                  {monthError && <span className="text-xs text-red-600">Could not load</span>}
                </form>
              )}
            </div>

            {tab === "attendance" && (
              <Card className="overflow-hidden">
                <div className={`overflow-x-auto transition-opacity ${monthLoading ? "opacity-50" : ""}`}>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Date</th>
                        <th className="text-right px-4 py-2 font-medium">Time In</th>
                        <th className="text-right px-4 py-2 font-medium">Start Break</th>
                        <th className="text-right px-4 py-2 font-medium">End Break</th>
                        <th className="text-right px-4 py-2 font-medium">Time Out</th>
                        <th className="text-right px-4 py-2 font-medium">Regular</th>
                        <th className="text-left px-4 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(days ?? []).map((d, i, all) => {
                        // Days are newest-first, so a week boundary is where the
                        // previous row belongs to a different Mon-Sun week.
                        const weekStarts = i > 0 && mondayOf(all[i - 1].date) !== mondayOf(d.date);
                        // Paid Leave / Unpaid Absence pay is fixed regardless of
                        // punches, so showing raw times next to that status would
                        // look contradictory.
                        const showTimes = d.dayStatus === null;
                        return (
                        <tr
                          key={d.date}
                          className={`border-t ${weekStarts ? "border-slate-300" : "border-slate-100"}`}
                        >
                          <td className="px-4 py-2 text-slate-800 whitespace-nowrap">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`w-9 shrink-0 py-0.5 rounded text-xs font-medium text-center ${dayAbbrev(d.date).className}`}
                              >
                                {dayAbbrev(d.date).label}
                              </span>
                              {d.date}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {showTimes ? d.timeIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {showTimes ? d.breakIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className={`px-4 py-2 text-right whitespace-nowrap ${d.returnedLateFromBreak ? "text-amber-600 font-medium" : "text-slate-800"}`}>
                            {showTimes ? d.breakOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {showTimes ? d.timeOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {d.regularHours.toFixed(2)} hr
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {d.dayStatus === "PAID_LEAVE" && <Badge status="paidLeave" />}
                              {d.dayStatus === "UNPAID_ABSENCE" && <Badge status="unpaidAbsence" />}
                              {d.isLate && <Badge status="late" />}
                              {d.isUndertime && <Badge status="undertime" />}
                              {d.returnedLateFromBreak && <Badge status="lateFromBreak" />}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {(days ?? []).length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                            No attendance records yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {tab === "payslips" && (
              <div className="flex flex-col gap-3">
                {(payslips ?? []).map((p) => (
                  <Card key={p.id} padded>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-slate-800">
                        {p.periodStart} to {p.periodEnd}
                      </p>
                      <span
                        className={`rounded-full text-xs px-2 py-0.5 font-medium ${
                          p.status === "FINALIZED"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {p.status === "FINALIZED" ? "Finalized" : "Draft — subject to change"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mb-2">
                      <div>
                        {payBasis === "DAILY" ? (
                          <>
                            <p className="text-slate-400">Days worked</p>
                            <p className="text-slate-800">
                              {p.daysWorked.toFixed(2)}
                              <span className="text-xs text-slate-400 ml-1">
                                ({p.regularHours.toFixed(2)} hrs)
                              </span>
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-slate-400">Regular hrs</p>
                            <p className="text-slate-800">{p.regularHours.toFixed(2)}</p>
                          </>
                        )}
                      </div>
                      <div>
                        <p className="text-slate-400">Gross pay</p>
                        <p className="text-slate-800">{peso(p.grossPay)}</p>
                      </div>
                    </div>
                    {(p.absentDays > 0 || p.lateCount > 0) && (
                      <div className="flex flex-wrap gap-2 mb-2 text-sm">
                        {p.absentDays > 0 && (
                          <span className="rounded-full bg-red-50 text-red-700 px-3 py-1">
                            Absent: {p.absentDays} {p.absentDays === 1 ? "day" : "days"}
                          </span>
                        )}
                        {p.lateCount > 0 && (
                          <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1">
                            Late: {p.lateCount} {p.lateCount === 1 ? "time" : "times"} (
                            {formatLate(p.lateMinutes)})
                          </span>
                        )}
                      </div>
                    )}
                    {p.adjustments.length > 0 && (() => {
                      const sorted = [...p.adjustments].sort((a, b) => b.amount - a.amount);
                      return (
                        <div className="mb-2 border border-slate-200 rounded-md overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                <th className="text-left px-3 py-1.5 font-medium">Type</th>
                                <th className="text-left px-3 py-1.5 font-medium">Label</th>
                                <th className="text-left px-3 py-1.5 font-medium">Note</th>
                                <th className="text-right px-3 py-1.5 font-medium">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map((a, i) => {
                                const isBonus = a.amount > 0;
                                return (
                                  <tr key={i} className="border-t border-slate-100">
                                    <td className="px-3 py-1.5">
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                          isBonus
                                            ? "bg-green-100 text-green-700"
                                            : "bg-red-100 text-red-700"
                                        }`}
                                      >
                                        {isBonus ? "Bonus" : "Deduction"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-slate-700">{a.label}</td>
                                    <td className="px-3 py-1.5 text-slate-500">
                                      {a.note ?? <span className="text-slate-300">—</span>}
                                    </td>
                                    <td
                                      className={`px-3 py-1.5 text-right font-medium ${
                                        isBonus ? "text-green-700" : "text-red-700"
                                      }`}
                                    >
                                      {isBonus ? "+" : "-"}
                                      {peso(Math.abs(a.amount))}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                    <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-600">Total pay</p>
                      <p className="text-lg font-bold text-slate-900">{peso(p.totalPay)}</p>
                    </div>
                  </Card>
                ))}
                {(payslips ?? []).length === 0 && (
                  <Card padded className="text-center text-slate-400">
                    No payslips yet.
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
