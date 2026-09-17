import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  updateEmployee,
  resetEmployeePin,
  grantSupervisorAccess,
  updateSupervisorAccess,
  setSupervisorAccessActive,
} from "../actions";
import PasswordInput from "@/components/PasswordInput";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { adminAccount: true },
  });
  if (!employee) notFound();

  const updateEmployeeWithId = updateEmployee.bind(null, employee.id);
  const resetPinWithId = resetEmployeePin.bind(null, employee.id);
  const grantAccessWithId = grantSupervisorAccess.bind(null, employee.id);
  const updateAccessWithId = updateSupervisorAccess.bind(null, employee.id);
  const setAccessActiveWithId = setSupervisorAccessActive.bind(
    null,
    employee.id,
    !employee.adminAccount?.active
  );

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Edit {employee.name}</h1>

      <form action={updateEmployeeWithId} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex items-center gap-4">
          {employee.photoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/kiosk/employee-photo/${employee.photoPath}`}
              alt={employee.name}
              className="w-16 h-16 rounded-full object-cover border border-slate-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">
              No photo
            </div>
          )}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Photo (optional)
            </label>
            <input
              name="photo"
              type="file"
              accept="image/*"
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="text-xs text-slate-500 mt-1">Leave blank to keep the current photo.</p>
          </div>
        </div>
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

      {employee.adminAccount ? (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Supervisor Access</h2>
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                employee.adminAccount.active
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {employee.adminAccount.active ? "Active" : "Revoked"}
            </span>
          </div>

          <form action={updateAccessWithId} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Login email
              </label>
              <input
                name="email"
                type="email"
                defaultValue={employee.adminAccount.email}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <PasswordInput
              name="newPassword"
              label="Reset password (optional)"
              required={false}
              minLength={8}
              placeholder="Leave blank to keep their current password"
              helperText="Fill this in if they forgot their password -- they can change it again themselves after logging in."
            />
            <button
              type="submit"
              className="w-full rounded-md bg-slate-100 text-slate-900 text-sm font-medium py-2 hover:bg-slate-200"
            >
              Save Login Changes
            </button>
          </form>

          <form action={setAccessActiveWithId}>
            <button
              type="submit"
              className={`w-full rounded-md text-sm font-medium py-2 ${
                employee.adminAccount.active
                  ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
              }`}
            >
              {employee.adminAccount.active ? "Revoke Supervisor Access" : "Reactivate Supervisor Access"}
            </button>
            {employee.adminAccount.active && (
              <p className="text-xs text-slate-500 mt-1">
                They keep punching in/out normally -- this only removes their admin dashboard login.
              </p>
            )}
          </form>
        </div>
      ) : (
        <form action={grantAccessWithId} className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Grant Supervisor Access</h2>
          <p className="text-xs text-slate-500">
            Gives this person a login to the admin dashboard with Supervisor access
            (Attendance, Sanitation, Inventory, operational Settings) -- not Payroll,
            Employees, Tasks, or financial Settings.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Login email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <PasswordInput
            name="password"
            label="Temporary password"
            minLength={8}
            helperText="They can change this after logging in."
          />
          <button
            type="submit"
            className="w-full rounded-md bg-slate-100 text-slate-900 text-sm font-medium py-2 hover:bg-slate-200"
          >
            Grant Access
          </button>
        </form>
      )}
    </div>
  );
}
