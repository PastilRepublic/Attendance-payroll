"use client";

import { useState } from "react";
import SanitationProgressCard from "@/components/SanitationProgressCard";
import Badge from "@/components/Badge";
import { REMINDER_TONES } from "@/components/SanitationReminderCard";
import {
  TIMING_DESCRIPTIONS,
  TIMING_LABELS,
  TIMING_ORDER,
  type SanitationTimingKey,
} from "@/lib/sanitationLabels";
import { formatDateKey, type ReminderPhase } from "@/lib/sanitationSchedule";

export interface SidebarTask {
  id: string;
  name: string;
  timing: SanitationTimingKey;
  status: "PENDING" | "DONE";
  inspectionResult: "PASS" | "FAIL" | null;
}

export interface SidebarUpcoming {
  schedule: "WEEKLY" | "MONTHLY";
  dueDate: string;
  reminderDate: string;
  phase: ReminderPhase;
  tasks: { id: string; name: string; timing: SanitationTimingKey }[];
}

export interface SidebarData {
  tasks: SidebarTask[];
  weekly: SidebarUpcoming;
  monthly: SidebarUpcoming;
}

type Tab = "today" | "weekly" | "monthly";

const PHASE_BADGES: Record<ReminderPhase, string> = {
  "due-today": "Due today",
  "coming-up": "Coming up",
  later: "Scheduled",
};

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
      className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition-colors ${
        active ? "bg-accent-800 text-white" : "text-slate-800 hover:bg-accent-50"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-px text-[10px] ${
          active ? "bg-white text-accent-900" : "bg-accent-50 text-accent-800"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6m-5.5 8 2 2 3.5-4"
      />
    </svg>
  );
}

/** One "Before lunch" / "Anytime" / "End of shift" card holding its duties. */
function GroupCard({
  timing,
  tasks,
}: {
  timing: SanitationTimingKey;
  tasks: { id: string; name: string; done?: boolean; result?: "PASS" | "FAIL" | null }[];
}) {
  return (
    <section className="mb-2 rounded-2xl border border-slate-300 bg-white p-3">
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <ClipboardIcon />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{TIMING_LABELS[timing]}</h3>
          <p className="text-[11px] leading-snug text-slate-500">{TIMING_DESCRIPTIONS[timing]}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-2.5 py-2 text-sm"
          >
            <span className={task.done ? "text-slate-400 line-through" : "text-slate-700"}>{task.name}</span>
            {task.result && (
              <Badge status={task.result === "PASS" ? "pass" : "fail"}>
                {task.result === "PASS" ? "Passed" : "Failed"}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReminderNote({ upcoming }: { upcoming: SidebarUpcoming }) {
  const tone = REMINDER_TONES[upcoming.schedule];
  const count = upcoming.tasks.length;
  return (
    <div className={`mb-2 rounded-2xl border px-3 py-2.5 ${tone.card}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className={`text-sm font-bold ${tone.title}`}>
          {upcoming.schedule === "WEEKLY" ? "Weekly" : "Monthly"} cleaning
        </p>
        <span
          className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${
            upcoming.phase === "later" ? tone.badgeLater : tone.badgeOpen
          }`}
        >
          {PHASE_BADGES[upcoming.phase]}
        </span>
      </div>
      <p className={`mt-1 text-xs ${tone.body}`}>
        {count === 0
          ? "No tasks set up yet."
          : `${count} ${count === 1 ? "task" : "tasks"} due ${formatDateKey(upcoming.dueDate, "EEE, MMM d")}`}
      </p>
      <p className={`text-[11px] font-medium ${tone.footer}`}>
        Reminder: {formatDateKey(upcoming.reminderDate, "EEE, MMM d")}
      </p>
    </div>
  );
}

/**
 * The kiosk home's narrow sanitation column: dark progress card, Today /
 * Weekly / Monthly tabs, and duties grouped by when they are due.
 */
export default function SanitationSidebar({ data }: { data: SidebarData }) {
  const [tab, setTab] = useState<Tab>("today");
  const upcoming = tab === "weekly" ? data.weekly : data.monthly;

  return (
    <div>
      {data.tasks.length > 0 && (
        <div className="mb-3">
          <SanitationProgressCard tasks={data.tasks} compact tone="light" />
        </div>
      )}

      <div className="mb-3 flex gap-0.5 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <TabButton label="Today" count={data.tasks.length} active={tab === "today"} onClick={() => setTab("today")} />
        <TabButton label="Weekly" count={data.weekly.tasks.length} active={tab === "weekly"} onClick={() => setTab("weekly")} />
        <TabButton label="Monthly" count={data.monthly.tasks.length} active={tab === "monthly"} onClick={() => setTab("monthly")} />
      </div>

      {tab === "today" ? (
        data.tasks.length === 0 ? (
          <p className="text-xs text-slate-400">No sanitation duties scheduled today.</p>
        ) : (
          TIMING_ORDER.map((timing) => {
            const group = data.tasks.filter((t) => t.timing === timing);
            if (group.length === 0) return null;
            return (
              <GroupCard
                key={timing}
                timing={timing}
                tasks={group.map((t) => ({
                  id: t.id,
                  name: t.name,
                  done: t.status === "DONE",
                  result: t.inspectionResult,
                }))}
              />
            );
          })
        )
      ) : (
        <>
          <ReminderNote upcoming={upcoming} />
          {TIMING_ORDER.map((timing) => {
            const group = upcoming.tasks.filter((t) => t.timing === timing);
            if (group.length === 0) return null;
            return <GroupCard key={timing} timing={timing} tasks={group} />;
          })}
        </>
      )}
    </div>
  );
}
