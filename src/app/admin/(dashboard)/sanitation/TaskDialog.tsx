"use client";

import { useRef } from "react";

/** A Cancel button for the form inside a TaskDialog -- closes the popup without saving. */
export function DialogCancelButton({ className }: { className: string }) {
  return (
    <button
      type="button"
      onClick={(e) => e.currentTarget.closest("dialog")?.close()}
      className={className}
    >
      Cancel
    </button>
  );
}

/**
 * A button that opens its children (the task form) in a popup. The form's own
 * server action does the saving; the popup closes on submit and resets when
 * dismissed so a cancelled edit doesn't linger.
 */
export default function TaskDialog({
  title,
  description,
  triggerLabel,
  triggerClassName,
  children,
}: {
  title: string;
  description: string;
  triggerLabel: React.ReactNode;
  triggerClassName: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={triggerClassName}>
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        // Clicking the dimmed backdrop (the dialog element itself) dismisses it.
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        onClose={() => dialogRef.current?.querySelector("form")?.reset()}
        // A submit bubbles up from the form; close once the browser has run its checks.
        onSubmit={() => setTimeout(() => dialogRef.current?.close(), 0)}
        className="m-auto w-[min(40rem,calc(100vw-1.5rem))] max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
