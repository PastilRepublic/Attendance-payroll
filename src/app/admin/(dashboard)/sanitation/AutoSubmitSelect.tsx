"use client";

/** A select that saves as soon as it changes -- it submits the form it sits in. */
export default function AutoSubmitSelect({
  name,
  defaultValue,
  className = "",
  children,
}: {
  name: string;
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={className}
    >
      {children}
    </select>
  );
}
