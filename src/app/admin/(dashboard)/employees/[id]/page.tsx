import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { prisma } from "@/lib/prisma";
import { updateEmployeeForm, resetEmployeePinForm, grantSupervisorAccessForm, updateSupervisorAccessForm, setSupervisorAccessActive
} from "../actions";
import PasswordInput from "@/components/PasswordInput";
import PayBasisFields from "@/components/PayBasisFields";
import PhotoInput from "@/components/PhotoInput";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import Badge from "@/components/Badge";
import PillButton from "@/components/ui/PillButton";

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

  const updateEmployeeWithId = updateEmployeeForm.bind(null, employee.id);
  const resetPinWithId = resetEmployeePinForm.bind(null, employee.id);
  const grantAccessWithId = grantSupervisorAccessForm.bind(null, employee.id);
  const updateAccessWithId = updateSupervisorAccessForm.bind(null, employee.id);
  const setAccessActiveWithId = setSupervisorAccessActive.bind(
    null,
    employee.id,
    !employee.adminAccount?.active
  );

  return (
    <div className="max-w-lg space-y-6">
      <SoftHeader title={`Edit ${employee.name}`} />

      <SoftCard>
        <ActionForm action={updateEmployeeWithId} className="space-y-4">
          <PhotoInput
            currentPhotoUrl={employee.photoPath ? `/api/kiosk/employee-photo/${employee.photoPath}` : null}
            helperText="Leave blank to keep the current photo."
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Name</label>
            <input
              name="name"
              defaultValue={employee.name}
              required
              className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
          </div>
          <PayBasisFields
            defaultPayBasis={employee.payBasis}
            defaultPayRate={Number(employee.payRate)}
          />
          <p className="text-xs text-slate-500 -mt-2">
            Hourly: per hour. Daily / Flat daily: per day. Flat daily pays the full rate for any
            day worked, however early they leave. Production doesn&apos;t use this rate; it uses
            the Cooking / Jar Filling rates in Settings.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              Date hired
            </label>
            <input
              name="dateHired"
              type="date"
              defaultValue={employee.dateHired.toISOString().slice(0, 10)}
              required
              className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
          </div>
          <PillButton type="submit" className="w-full">Save Changes</PillButton>
        </ActionForm>
      </SoftCard>

      <SoftCard>
        <ActionForm action={resetPinWithId} className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Reset PIN</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              New 4-digit PIN
            </label>
            <input
              name="pin"
              required
              pattern="\d{4}"
              maxLength={4}
              inputMode="numeric"
              className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
          </div>
          <PillButton type="submit" variant="secondary" className="w-full">Set New PIN</PillButton>
        </ActionForm>
      </SoftCard>

      {employee.adminAccount ? (
        <SoftCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Supervisor Access</h2>
            <Badge status={employee.adminAccount.active ? "active" : "accessRevoked"}>
              {employee.adminAccount.active ? "Active" : "Revoked"}
            </Badge>
          </div>

          <ActionForm action={updateAccessWithId} successMessage="Saved" className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                Login email
              </label>
              <input
                name="email"
                type="email"
                defaultValue={employee.adminAccount.email}
                required
                className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
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
            <PillButton type="submit" variant="secondary" className="w-full">Save Login Changes</PillButton>
          </ActionForm>

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
        </SoftCard>
      ) : (
        <SoftCard>
          <ActionForm action={grantAccessWithId} className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Grant Supervisor Access</h2>
            <p className="text-xs text-slate-500">
              Gives this person a login to the admin dashboard with Supervisor access
              (Attendance, Sanitation, Inventory, operational Settings) -- not Payroll,
              Employees, Tasks, or financial Settings.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">Login email</label>
              <input
                name="email"
                type="email"
                required
                className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
              />
            </div>
            <PasswordInput
              name="password"
              label="Temporary password"
              minLength={8}
              helperText="They can change this after logging in."
            />
            <PillButton type="submit" variant="secondary" className="w-full">Grant Access</PillButton>
          </ActionForm>
        </SoftCard>
      )}
    </div>
  );
}
