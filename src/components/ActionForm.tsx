"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { FormState } from "@/lib/formAction";

/** What ActionForm tracks on top of the action's own result: what has been added so far in this window. */
type Tracked = FormState & { added: string[] };

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
  multiEntry,
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
  /**
   * For entering several things in a row inside a <dialog>: after a save the popup stays
   * open, the listed fields are cleared (the rest, like the date, are kept), the first
   * one is focused, and a list shows what has been added so far. A submit button with
   * value="close" saves and then closes the popup.
   */
  multiEntry?: { clear: string[] };
}) {
  const [state, formAction, pending] = useActionState<Tracked, FormData>(
    async (prev, formData) => {
      const next = await action(prev, formData);
      if (next.error || next.confirm) return { ...next, added: prev.added };
      return { ...next, added: next.message ? [next.message, ...prev.added].slice(0, 8) : prev.added };
    },
    { added: [] }
  );
  const [dismissed, setDismissed] = useState<Tracked | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const closeAfterSave = useRef(false);

  useEffect(() => {
    if (!state.savedAt) return;
    const form = formRef.current;
    if (multiEntry) {
      for (const name of multiEntry.clear) {
        const el = form?.elements.namedItem(name);
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          el.value = "";
        }
      }
      if (closeAfterSave.current) {
        form?.closest("dialog")?.close();
      } else {
        const first = form?.elements.namedItem(multiEntry.clear[0]);
        if (first instanceof HTMLElement) first.focus();
      }
      return;
    }
    if (resetOnSuccess) form?.reset();
    if (closeDialogOnSuccess) form?.closest("dialog")?.close();
  }, [resetOnSuccess, closeDialogOnSuccess, multiEntry, state.savedAt]);

  /** "Add anyway": the same entry again, with the go-ahead the action asked for. */
  function confirmAndResubmit() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("confirm", "yes");
    startTransition(() => formAction(fd));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    closeAfterSave.current = submitter?.getAttribute("value") === "close";
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  // The fields sit inside a <fieldset> (it disables them while saving). Flex and grid forms
  // work through it because it is "display: contents", but a vertical-spacing class
  // (space-y-*) only reaches direct children -- so that class moves onto the fieldset.
  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const spacing = classes.find((c) => c.startsWith("space-y-"));
  const formClass = classes.filter((c) => c !== spacing).join(" ");

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={compactError ? `relative ${formClass}`.trim() : formClass || undefined}
    >
      <fieldset
        disabled={pending}
        className={spacing ? `${spacing} m-0 min-w-0 border-0 p-0` : "contents"}
      >
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
      {!compactError && state.confirm && !pending && (
        <div
          role="alert"
          className="mt-2 w-full basis-full rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {state.confirm}
          <div className="mt-2">
            <button
              type="button"
              onClick={confirmAndResubmit}
              className="rounded-full border border-amber-300 bg-white px-4 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Add anyway
            </button>
          </div>
        </div>
      )}
      {!state.error && successMessage && state.savedAt && !pending && (
        <p role="status" className="basis-full w-full text-xs text-green-700 mt-1">
          {successMessage}
        </p>
      )}
      {multiEntry && state.added.length > 0 && (
        <div
          role="status"
          className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"
        >
          <div className="font-medium">Added in this window ({state.added.length})</div>
          <ul className="mt-1 space-y-0.5">
            {state.added.map((m, i) => (
              <li key={`${i}-${m}`}>✓ {m}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
