import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateEmployee, resetEmployeePin } from "../actions";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) notFound();

  const updateEmployeeWithId = updateEmployee.bind(null, employee.id);
  const resetPinWithId = resetEmployeePin.bind(null, employee.id);

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Edit {employee.name}</h1>

      <form action={updateEmployeeWithId} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input
            name="name"
            defaultValue={employee.name}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Pay basis
            </label>
            <select
              name="payBasis"
              defaultValue={employee.payBasis}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="HOURLY">Hourly</option>
              <option value="DAILY">Daily</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Pay rate (₱)
            </label>
            <input
              name="payRate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={Number(employee.payRate)}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Date hired
          </label>
          <input
            name="dateHired"
            type="date"
            defaultValue={employee.dateHired.toISOString().slice(0, 10)}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800"
        >
          Save Changes
        </button>
      </form>

      <form action={resetPinWithId} className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Reset PIN</h2>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            New 4-6 digit PIN
          </label>
          <input
            name="pin"
            required
            pattern="\d{4,6}"
            inputMode="numeric"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-100 text-slate-900 text-sm font-medium py-2 hover:bg-slate-200"
        >
          Set New PIN
        </button>
      </form>
    </div>
  );
}
