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
import PhotoInput from "@/components/PhotoInput";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";

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
      <PageHeader title={`Edit ${employee.name}`} />

      <Card className="p-6">
        <form action={updateEmployeeWithId} className="space-y-4">
          <PhotoInput
            currentPhotoUrl={employee.photoPath ? `/api/kiosk/employee-photo/${employee.photoPath}` : null}
            helperText="Leave blank to keep the current photo."
          />
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
          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </Card>

      <Card className="p-6">
        <form action={resetPinWithId} className="space-y-4">
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
          <Button type="submit" variant="secondary" className="w-full">Set New PIN</Button>
        </form>
      </Card>

      {employee.adminAccount ? (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Supervisor Access</h2>
            <Badge status={employee.adminAccount.active ? "active" : "accessRevoked"}>
              {employee.adminAccount.active ? "Active" : "Revoked"}
            </Badge>
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
            <Button type="submit" variant="secondary" className="w-full">Save Login Changes</Button>
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
        </Card>
      ) : (
        <Card className="p-6">
          <form action={grantAccessWithId} className="space-y-4">
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
            <Button type="submit" variant="secondary" className="w-full">Grant Access</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
