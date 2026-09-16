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
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
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
