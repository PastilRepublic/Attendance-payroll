"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { FormState } from "@/lib/formAction";

/**
 * A <form> for a server action that returns FormState: a rejected entry shows
 * its message right under the fields and keeps what was typed (React would
 * otherwise reset the form). While it's saving the fields are disabled.
 */
export default function ActionForm({
  action,
  className,
  children,
  successMessage,
  resetOnSuccess = false,
  closeDialogOnSuccess = false,
  compactError = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  className?: string;
  children: ReactNode;
  /** Shown after a successful save (e.g. "Saved"); omit when the page re-renders to show the result. */
  successMessage?: string;
  /** Clear the fields after a successful save (for "add" forms). */
  resetOnSuccess?: boolean;
  /** For a form inside a <dialog>: close the popup after a successful save (it stays open to show an error). */
  closeDialogOnSuccess?: boolean;
  /** For a small button (Remove, Dismiss, Activate...): show the error as a floating note under the button instead of in the layout. */
  compactError?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.savedAt) return;
    if (resetOnSuccess) formRef.current?.reset();
    if (closeDialogOnSuccess) formRef.current?.closest("dialog")?.close();
  }, [resetOnSuccess, closeDialogOnSuccess, state.savedAt]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={compactError ? `relative ${className ?? ""}`.trim() : className}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {compactError && state.error && dismissed !== state && (
        <div
          role="alert"
          className="absolute right-0 top-full z-20 mt-1.5 w-60 max-w-[80vw] rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs text-rose-800 shadow-md"
        >
          {state.error}
          <button
            type="button"
            onClick={() => setDismissed(state)}
            className="ml-2 font-medium underline"
          >
            OK
          </button>
        </div>
      )}
      {!compactError && state.error && (
        <p role="alert" className="basis-full w-full text-xs text-red-600 mt-1">
          {state.error}
        </p>
      )}
      {!state.error && successMessage && state.savedAt && !pending && (
        <p role="status" className="basis-full w-full text-xs text-green-700 mt-1">
          {successMessage}
        </p>
      )}
    </form>
  );
}
