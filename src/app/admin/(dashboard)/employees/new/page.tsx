import { formatInTimeZone } from "date-fns-tz";
import ActionForm from "@/components/ActionForm";
import { TIMEZONE } from "@/lib/payroll";
import { createEmployeeForm } from "../actions";
import PasswordInput from "@/components/PasswordInput";
import PayBasisFields from "@/components/PayBasisFields";
import PhotoInput from "@/components/PhotoInput";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import PillButton from "@/components/ui/PillButton";

export default function NewEmployeePage() {
  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");

  return (
    <div className="max-w-lg">
      <SoftHeader title="New Employee" />
      <SoftCard>
      <ActionForm action={createEmployeeForm} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-800">Name</label>
          <input
            name="name"
            required
            className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-800">
            4-digit PIN
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
        <PayBasisFields />
        <p className="text-xs text-slate-500 -mt-2">
          Hourly: per hour. Daily / Flat daily: per day. Flat daily pays the full rate for any day
          worked, however early they leave. Production doesn&apos;t use this rate; it uses the
          Cooking / Jar Filling rates in Settings.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-800">
            Date hired
          </label>
          <input
            name="dateHired"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
        </div>
        <PhotoInput />
        <details className="border border-slate-200 rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            + Also grant supervisor access (optional)
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-500">
              Gives this person a login to the admin dashboard with Supervisor access
              (Attendance, Sanitation, Inventory, operational Settings) -- not Payroll,
              Employees, Tasks, or financial Settings.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                Login email
              </label>
              <input
                name="supervisorEmail"
                type="email"
                className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
              />
            </div>
            <PasswordInput
              name="supervisorPassword"
              label="Temporary password"
              required={false}
              minLength={8}
              helperText="They can change this after logging in."
            />
          </div>
        </details>

        <PillButton type="submit" className="w-full">Create Employee</PillButton>
      </ActionForm>
      </SoftCard>
    </div>
  );
}
