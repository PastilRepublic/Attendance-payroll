"use client";

import { useRef, useState } from "react";
import { pillClass, type PillSize, type PillVariant } from "./styles";

/**
 * A pill button that opens a form in a pop-up. Put an <ActionForm closeDialogOnSuccess>
 * inside: it closes the pop-up once saved and keeps it open to show an error. Each
 * time the pop-up is opened the form starts fresh (no old typing or old error).
 */
export default function FormDialog({
  triggerLabel,
  title,
  description,
  variant = "secondary",
  size = "md",
  children,
}: {
  triggerLabel: React.ReactNode;
  title: string;
  description?: string;
  variant?: PillVariant;
  size?: PillSize;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [freshKey, setFreshKey] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFreshKey((k) => k + 1);
          dialogRef.current?.showModal();
        }}
        className={pillClass(variant, size)}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        // Tapping the dimmed area outside the card closes it.
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(28rem,calc(100vw-1.5rem))] max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div key={freshKey} className="mt-5">
            {children}
          </div>
        </div>
      </dialog>
    </>
  );
}
