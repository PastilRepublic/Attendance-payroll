"use client";

export default function EmployeeSelect({
  employees,
  defaultValue,
}: {
  employees: { id: string; name: string }[];
  defaultValue: string;
}) {
  return (
    <select
      name="employeeId"
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
    >
      <option value="" disabled>
        Select employee...
      </option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}
