import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateSettings, changePassword } from "./actions";
import PasswordInput from "@/components/PasswordInput";

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function SettingsPage() {
  const session = await auth();
  const isOwner = session?.user?.role === "OWNER";

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Settings</h1>

      <form action={updateSettings} className="bg-white rounded-lg shadow p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Shift start
            </label>
            <input
              name="shiftStartTime"
              type="time"
              defaultValue={settings.shiftStartTime}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Shift end
            </label>
            <input
              name="shiftEndTime"
              type="time"
              defaultValue={settings.shiftEndTime}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {isOwner && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Unpaid break (minutes)
                </label>
                <input
                  name="unpaidLunchMinutes"
                  type="number"
                  min="0"
                  defaultValue={settings.unpaidLunchMinutes}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Also the kiosk&apos;s Break allowance -- an employee who Starts Break and takes
                  longer than this to End Break is flagged &quot;Late from break&quot;.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Regular hours cap / day
                </label>
                <input
                  name="regularHoursCapPerDay"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue={Number(settings.regularHoursCapPerDay)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Hours worked beyond this are tracked as OT hours for reference, but are not
                  automatically paid -- add a manual Bonus adjustment on the payslip if you want to
                  compensate them.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Late grace period (minutes)
              </label>
              <input
                name="gracePeriodMinutes"
                type="number"
                min="0"
                defaultValue={settings.gracePeriodMinutes}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Pay period starts on
              </label>
              <select
                name="payPeriodStartDay"
                defaultValue={settings.payPeriodStartDay}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {dayNames.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Pay periods are weekly, starting on this day.
              </p>
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="requirePhotoOnPunch"
            defaultChecked={settings.requirePhotoOnPunch}
            className="rounded border-slate-300"
          />
          Require a photo at each kiosk punch
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800"
        >
          Save Settings
        </button>
      </form>

      <form action={changePassword} className="bg-white rounded-lg shadow p-6 space-y-4 mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Change Admin Password</h2>
        <PasswordInput
          name="currentPassword"
          label="Current password"
          autoComplete="current-password"
        />
        <PasswordInput name="newPassword" label="New password" autoComplete="new-password" />
        <PasswordInput
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
        />
        <p className="text-xs text-slate-500">
          You&apos;ll be signed out after changing your password and need to log in again.
        </p>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-100 text-slate-900 text-sm font-medium py-2 hover:bg-slate-200"
        >
          Change Password
        </button>
      </form>
    </div>
  );
}
