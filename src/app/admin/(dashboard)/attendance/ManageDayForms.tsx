"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import PillButton from "@/components/ui/PillButton";
import { saveDayPunches, setDayStatus, type DayFormState } from "./actions";

export interface DayField {
  name: "timeIn" | "breakStart" | "breakEnd" | "timeOut";
  label: string;
  /** Current time as HH:mm, or "" when there's no punch for that slot. */
  value: string;
  photoPath: string | null;
}

/**
 * Submits without React's automatic form reset, so a rejected entry (times
 * out of order, a locked pay period, ...) keeps what the admin typed next to
 * the error instead of snapping back to the saved times.
 */
function submitWithoutReset(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

export function DayPunchesForm({
  employeeId,
  date,
  fields,
}: {
  employeeId: string;
  date: string;
  fields: DayField[];
}) {
  const [state, action, pending] = useActionState<DayFormState, FormData>(saveDayPunches, {});

  return (
    <form onSubmit={submitWithoutReset(action)}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="date" value={date} />
      <div className="space-y-2">
        {fields.map((f) => (
          <div key={f.name} className="flex items-center gap-3">
            <label htmlFor={`${f.name}-${employeeId}-${date}`} className="w-24 shrink-0 text-xs font-medium text-slate-600">
              {f.label}
            </label>
            <input
              id={`${f.name}-${employeeId}-${date}`}
              type="time"
              name={f.name}
              defaultValue={f.value}
              className="flex-1 rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
            {f.photoPath && (
              <a
                href={`/api/admin/punch-photo/${f.photoPath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/punch-photo/${f.photoPath}`}
                  alt={`${f.label} photo`}
                  className="w-8 h-8 rounded object-cover border border-slate-200 hover:opacity-80"
                />
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <label className="block text-xs text-slate-500 mb-1">Reason for the change (optional)</label>
        <input
          type="text"
          name="reason"
          className="w-full rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        />
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-slate-400">Clear a time to remove that punch.</p>
        <PillButton size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </PillButton>
      </div>
    </form>
  );
}

export function DayStatusForm({
  employeeId,
  date,
  dayStatus,
}: {
  employeeId: string;
  date: string;
  dayStatus: string;
}) {
  const [state, action, pending] = useActionState<DayFormState, FormData>(setDayStatus, {});

  return (
    <form onSubmit={submitWithoutReset(action)} className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-2">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="date" value={date} />
        <select
          name="status"
          defaultValue={dayStatus}
          className="flex-1 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        >
          <option value="NORMAL">Normal</option>
          <option value="PAID_LEAVE">Paid Leave</option>
          <option value="UNPAID_ABSENCE">Unpaid Absence</option>
        </select>
        <PillButton variant="secondary" size="sm" disabled={pending}>
          Set
        </PillButton>
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
