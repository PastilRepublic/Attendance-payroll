"use client";

import { useEffect, useRef } from "react";

/**
 * The "Production day" checkboxes. Ticking both means the task runs every day;
 * ticking neither is blocked so a task can't be left with no day at all.
 */
export default function ProductionDayFields({
  defaultCooking,
  defaultJarFilling,
}: {
  defaultCooking: boolean;
  defaultJarFilling: boolean;
}) {
  const cookingRef = useRef<HTMLInputElement>(null);
  const jarRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const anyTicked = cookingRef.current?.checked || jarRef.current?.checked;
    cookingRef.current?.setCustomValidity(anyTicked ? "" : "Pick at least one production day.");
  };

  // The dialog resets its form when dismissed; re-check once that has happened.
  useEffect(() => {
    const form = cookingRef.current?.form;
    const onReset = () => setTimeout(validate, 0);
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, []);

  const rowClass =
    "flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base font-medium";

  return (
    <fieldset>
      <legend className="mb-2 text-base font-semibold">Production day</legend>
      <div className="space-y-3">
        <label className={rowClass}>
          <input
            ref={cookingRef}
            type="checkbox"
            name="cookingDay"
            defaultChecked={defaultCooking}
            onChange={validate}
            className="h-5 w-5 accent-slate-900"
          />
          Cooking day
        </label>
        <label className={rowClass}>
          <input
            ref={jarRef}
            type="checkbox"
            name="jarFillingDay"
            defaultChecked={defaultJarFilling}
            onChange={validate}
            className="h-5 w-5 accent-slate-900"
          />
          Jar filling day
        </label>
      </div>
    </fieldset>
  );
}
