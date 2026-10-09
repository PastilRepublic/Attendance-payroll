"use client";

import { useRouter } from "next/navigation";

/** A month field that reloads the page (Payroll, Finance) for the month you pick. */
export default function MonthPicker({
  value,
  current,
  basePath = "/admin/payroll",
}: {
  value: string;
  current: string;
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <input
      type="month"
      aria-label="Month to show"
      value={value}
      max={current}
      onChange={(e) => {
        const picked = e.target.value;
        if (picked) router.push(picked === current ? basePath : `${basePath}?month=${picked}`);
      }}
      className="rounded-full border border-accent-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
    />
  );
}
