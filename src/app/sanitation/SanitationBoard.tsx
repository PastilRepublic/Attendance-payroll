"use client";

import { useState } from "react";
import SanitationProgressCard from "@/components/SanitationProgressCard";
import SanitationReminderCard from "@/components/SanitationReminderCard";
import {
  SCHEDULE_LABELS,
  TIMING_DESCRIPTIONS,
  TIMING_LABELS,
  TIMING_ORDER,
  type SanitationScheduleKey,
  type SanitationTimingKey,
} from "@/lib/sanitationLabels";
import type { ReminderPhase } from "@/lib/sanitationSchedule";

export interface BoardTask {
  id: string;
  name: string;
  instruction: string;
  timing: SanitationTimingKey;
  schedule: SanitationScheduleKey;
  status: "PENDING" | "DONE";
  employeeName: string | null;
  /** Pre-formatted time of day, e.g. "9:15 AM". */
  completedLabel: string | null;
  inspectionResult: "PASS" | "FAIL" | null;
}

export interface BoardUpcoming {
  schedule: "WEEKLY" | "MONTHLY";
  dueDate: string;
  reminderDate: string;
  phase: ReminderPhase;
  tasks: { id: string; name: string; instruction: string; timing: SanitationTimingKey }[];
}

type Tab = "today" | "weekly" | "monthly";

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6m-5.5 8 2 2 3.5-4"
      />
    </svg>
  );
}

function TaskStatus({ task }: { task: BoardTask }) {
  if (task.inspectionResult === "PASS") {
    return <p className="mt-2 text-sm font-semibold text-green-700">Verified</p>;
  }
  if (task.inspectionResult === "FAIL") {
    return <p className="mt-2 text-sm font-semibold text-red-600">Failed inspection — needs redoing</p>;
  }
  if (task.status === "DONE") {
    return (
      <p className="mt-2 text-sm font-semibold text-amber-700">
        Done{task.employeeName ? ` by ${task.employeeName}` : ""}
        {task.completedLabel ? ` · ${task.completedLabel}` : ""} — waiting for inspection
      </p>
    );
  }
  return <p className="mt-2 text-sm text-slate-400">Not done yet</p>;
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-base font-semibold transition-colors ${
        active ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-100"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2.5 py-0.5 text-sm ${
          active ? "bg-white text-slate-900" : "bg-slate-100 text-slate-700"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export default function SanitationBoard({
  tasks,
  weekly,
  monthly,
}: {
  tasks: BoardTask[];
  weekly: BoardUpcoming;
  monthly: BoardUpcoming;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const upcoming = tab === "weekly" ? weekly : monthly;

  return (
    <div className="space-y-5">
      {tasks.length > 0 && <SanitationProgressCard tasks={tasks} tone="light" />}

      <div className="flex gap-1 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        <TabButton label="Today" count={tasks.length} active={tab === "today"} onClick={() => setTab("today")} />
        <TabButton label="Weekly" count={weekly.tasks.length} active={tab === "weekly"} onClick={() => setTab("weekly")} />
        <TabButton label="Monthly" count={monthly.tasks.length} active={tab === "monthly"} onClick={() => setTab("monthly")} />
      </div>

      {tab === "today" && (
        <>
          {tasks.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-slate-400">
              No sanitation duties scheduled for today.
            </p>
          )}
          {TIMING_ORDER.map((timing) => {
            const group = tasks.filter((t) => t.timing === timing);
            if (group.length === 0) return null;
            return (
              <section key={timing} className="rounded-3xl border border-slate-300 bg-white p-5">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                    <ClipboardIcon />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{TIMING_LABELS[timing]}</h2>
                    <p className="mt-0.5 text-base text-slate-500">{TIMING_DESCRIPTIONS[timing]}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-3">
                  {group.map((task) => (
                    <li key={task.id} className="rounded-2xl border border-slate-300 px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-bold text-slate-900">{task.name}</p>
                        {task.schedule !== "DAILY" && (
                          <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            {SCHEDULE_LABELS[task.schedule]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-base text-slate-600">{task.instruction}</p>
                      <TaskStatus task={task} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {tab !== "today" && (
        <>
          <SanitationReminderCard
            schedule={upcoming.schedule}
            count={upcoming.tasks.length}
            dueDate={upcoming.dueDate}
            reminderDate={upcoming.reminderDate}
            phase={upcoming.phase}
          />
          {TIMING_ORDER.map((timing) => {
            const group = upcoming.tasks.filter((t) => t.timing === timing);
            if (group.length === 0) return null;
            return (
              <section key={timing} className="rounded-3xl border border-slate-300 bg-white p-5">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                    <ClipboardIcon />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{TIMING_LABELS[timing]}</h2>
                    <p className="mt-0.5 text-base text-slate-500">{TIMING_DESCRIPTIONS[timing]}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-3">
                  {group.map((task) => (
                    <li key={task.id} className="rounded-2xl border border-slate-300 px-5 py-4">
                      <p className="text-lg font-bold text-slate-900">{task.name}</p>
                      <p className="mt-1 text-base text-slate-600">{task.instruction}</p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
