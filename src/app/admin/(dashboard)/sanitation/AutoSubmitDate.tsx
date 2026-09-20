"use client";

/**
 * A date field that opens the browser's calendar as soon as it's tapped, and
 * saves (submits its form) once a full date is picked.
 */
export default function AutoSubmitDate({
  name,
  defaultValue,
  min,
  max,
  className = "",
}: {
  name: string;
  defaultValue: string;
  min: string;
  max: string;
  className?: string;
}) {
  return (
    <input
      type="date"
      name={name}
      defaultValue={defaultValue}
      min={min}
      max={max}
      required
      onClick={(e) => {
        try {
          e.currentTarget.showPicker();
        } catch {
          // Older browsers just use the field's own calendar button.
        }
      }}
      onChange={(e) => {
        if (e.currentTarget.value) e.currentTarget.form?.requestSubmit();
      }}
      className={className}
    />
  );
}
