"use client";

import { useState } from "react";

// Date keys are "yyyy-MM-dd" strings throughout, so no timezone math is needed.

export function addDaysKey(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday of the week containing dateStr -- payroll weeks run Mon-Sun.
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return addDaysKey(dateStr, -((d.getUTCDay() + 6) % 7));
}

export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthEndKey(month: string): string {
  return addDaysKey(`${shiftMonthKey(month, 1)}-01`, -1);
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

interface Props {
  start: string;
  end: string;
  today: string;
  earliestDate: string;
  onSelect: (start: string, end: string) => void;
}

/**
 * Month grid (Mon-first, matching payroll weeks). Click a day, then a second
 * day, to pick a range that may cross months; click the ">" at the start of a
 * row to pick that whole Mon-Sun week in one tap.
 */
export default function RangeCalendar({ start, end, today, earliestDate, onSelect }: Props) {
  const [viewMonth, setViewMonth] = useState(start.slice(0, 7));
  const [anchor, setAnchor] = useState<string | null>(null);

  const first = `${viewMonth}-01`;
  const gridStart = mondayOf(first);
  const weeks: string[][] = [];
  for (let w = gridStart; w <= monthEndKey(viewMonth); w = addDaysKey(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysKey(w, i)));
  }

  const minMonth = earliestDate.slice(0, 7);
  const maxMonth = today.slice(0, 7);

  // While mid-selection, the range is just the anchor day.
  const rangeStart = anchor ?? start;
  const rangeEnd = anchor ?? end;

  function pickDay(day: string) {
    if (day > today || day < earliestDate) return;
    if (!anchor) {
      setAnchor(day);
      return;
    }
    const [s, e] = day < anchor ? [day, anchor] : [anchor, day];
    setAnchor(null);
    onSelect(s, e);
  }

  function pickWeek(monday: string) {
    if (monday > today) return;
    const sunday = addDaysKey(monday, 6);
    setAnchor(null);
    onSelect(monday < earliestDate ? earliestDate : monday, sunday > today ? today : sunday);
  }

  return (
    <div className="w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewMonth(shiftMonthKey(viewMonth, -1))}
          disabled={viewMonth <= minMonth}
          aria-label="Previous month"
          className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-slate-800">{monthTitle(viewMonth)}</p>
        <button
          type="button"
          onClick={() => setViewMonth(shiftMonthKey(viewMonth, 1))}
          disabled={viewMonth >= maxMonth}
          aria-label="Next month"
          className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-[1.25rem_repeat(7,1fr)] gap-y-0.5 text-center text-xs">
        <span />
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 font-medium text-slate-400">
            {d}
          </span>
        ))}
        {weeks.map((row) => (
          <div key={row[0]} className="contents">
            <button
              type="button"
              onClick={() => pickWeek(row[0])}
              disabled={row[0] > today}
              title="Select this whole week"
              aria-label={`Select week of ${row[0]}`}
              className="text-slate-300 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-300"
            >
              ›
            </button>
            {row.map((day) => {
              const outside = day.slice(0, 7) !== viewMonth;
              const disabled = day > today || day < earliestDate;
              const inRange = day >= rangeStart && day <= rangeEnd;
              const isEdge = day === rangeStart || day === rangeEnd;
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => pickDay(day)}
                  disabled={disabled}
                  className={`h-8 text-sm ${
                    isEdge
                      ? "bg-slate-900 text-white font-semibold"
                      : inRange
                        ? "bg-slate-200 text-slate-900"
                        : disabled
                          ? "text-slate-300"
                          : outside
                            ? "text-slate-400 hover:bg-slate-100"
                            : "text-slate-800 hover:bg-slate-100"
                  } ${day === rangeStart ? "rounded-l-full" : ""} ${
                    day === rangeEnd ? "rounded-r-full" : ""
                  } ${day === today && !isEdge ? "font-bold underline" : ""}`}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {anchor ? "Now tap the last day." : "Tap a first day and a last day, or › for a whole week."}
      </p>
    </div>
  );
}
