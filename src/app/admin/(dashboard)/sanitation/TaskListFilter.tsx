"use client";

import { useState } from "react";

type Filter = "ALL" | "DAILY" | "WEEKLY" | "MONTHLY";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DAILY", label: "Daily" },
  { key: "WEEKLY", label: "Weekly" },
  { key: "MONTHLY", label: "Monthly" },
];

/**
 * Pills above the task list that show only Daily, Weekly or Monthly tasks.
 * The cards stay server-rendered (each `li` carries data-schedule); the
 * filter just hides the ones that don't match with CSS.
 */
export default function TaskListFilter({
  counts,
  children,
}: {
  counts: Record<Filter, number>;
  children: React.ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");

  return (
    <div className="px-4 pb-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              filter === key
                ? "bg-accent-800 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-accent-50"
            }`}
          >
            {label} <span className={filter === key ? "text-white/80" : "text-slate-400"}>{counts[key]}</span>
          </button>
        ))}
      </div>
      <ul
        data-filter={filter}
        className="space-y-4 [&[data-filter=DAILY]>li:not([data-schedule=DAILY])]:hidden [&[data-filter=WEEKLY]>li:not([data-schedule=WEEKLY])]:hidden [&[data-filter=MONTHLY]>li:not([data-schedule=MONTHLY])]:hidden"
      >
        {children}
      </ul>
    </div>
  );
}
