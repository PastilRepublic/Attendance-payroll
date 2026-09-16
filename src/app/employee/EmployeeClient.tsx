"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface EmployeeOption {
  id: string;
  name: string;
}

interface AttendanceDay {
  date: string;
  morningIn: string | null;
  morningOut: string | null;
  afternoonIn: string | null;
  afternoonOut: string | null;
  regularHours: number;
  overtimeHours: number;
  isLate: boolean;
  isUndertime: boolean;
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
  overtimeHours: number;
  basePay: number;
  grossPay: number;
  adjustments: PayslipAdjustment[];
  adjustmentsTotal: number;
  totalPay: number;
}

type Screen = "selectName" | "pin" | "dashboard";
type Tab = "attendance" | "payslips";

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setPayslips(payData.payslips ?? []);
      setScreen("dashboard");
    } catch {
      setLoadError("Could not reach the server. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  function handleDigit(d: string) {
    if (checking || pin.length >= 6 || !selected) return;
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
    setTab("attendance");
  }

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
              {Array.from({ length: 6 }).map((_, i) => (
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

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setTab("attendance")}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  tab === "attendance"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Attendance History
              </button>
              <button
                onClick={() => setTab("payslips")}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  tab === "payslips"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Payslips
              </button>
            </div>

            {tab === "attendance" && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <p className="px-4 py-3 text-sm text-slate-500 border-b border-slate-200">
                  Last 30 days
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Date</th>
                        <th className="text-right px-4 py-2 font-medium">Morning In</th>
                        <th className="text-right px-4 py-2 font-medium">Morning Out</th>
                        <th className="text-right px-4 py-2 font-medium">Afternoon In</th>
                        <th className="text-right px-4 py-2 font-medium">Afternoon Out</th>
                        <th className="text-right px-4 py-2 font-medium">Regular</th>
                        <th className="text-right px-4 py-2 font-medium">Overtime</th>
                        <th className="text-left px-4 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(days ?? []).map((d) => {
                        // Paid Leave / Unpaid Absence pay is fixed regardless of
                        // punches, so showing raw times next to that status would
                        // look contradictory.
                        const showTimes = d.dayStatus === null;
                        return (
                        <tr key={d.date} className="border-t border-slate-100">
                          <td className="px-4 py-2 text-slate-800 whitespace-nowrap">{d.date}</td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {showTimes ? d.morningIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {showTimes ? d.morningOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {showTimes ? d.afternoonIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {showTimes ? d.afternoonOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {d.regularHours.toFixed(2)} hr
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
                            {d.overtimeHours.toFixed(2)} hr
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {d.dayStatus === "PAID_LEAVE" && (
                                <span className="rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5">
                                  Paid leave
                                </span>
                              )}
                              {d.dayStatus === "UNPAID_ABSENCE" && (
                                <span className="rounded-full bg-red-100 text-red-700 text-xs px-2 py-0.5">
                                  Unpaid absence
                                </span>
                              )}
                              {d.isLate && (
                                <span className="rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5">
                                  Late
                                </span>
                              )}
                              {d.isUndertime && (
                                <span className="rounded-full bg-rose-100 text-rose-700 text-xs px-2 py-0.5">
                                  Undertime
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {(days ?? []).length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                            No attendance records yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === "payslips" && (
              <div className="flex flex-col gap-3">
                {(payslips ?? []).map((p) => (
                  <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-slate-600 mb-2">
                      <div>
                        <p className="text-slate-400">Regular hrs</p>
                        <p className="text-slate-800">{p.regularHours.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Overtime hrs</p>
                        <p className="text-slate-800">{p.overtimeHours.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Base pay</p>
                        <p className="text-slate-800">{peso(p.basePay)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Gross pay</p>
                        <p className="text-slate-800">{peso(p.grossPay)}</p>
                      </div>
                    </div>
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
                  </div>
                ))}
                {(payslips ?? []).length === 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400">
                    No payslips yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
