import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import { createEmployee } from "../actions";

export default function NewEmployeePage() {
  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">New Employee</h1>
      <form action={createEmployee} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input
            name="name"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            4-6 digit PIN
          </label>
          <input
            name="pin"
            required
            pattern="\d{4,6}"
            inputMode="numeric"
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
            defaultValue={today}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800"
        >
          Create Employee
        </button>
      </form>
    </div>
  );
}
