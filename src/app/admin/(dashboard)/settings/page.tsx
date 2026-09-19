import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateSettings, changePassword, setAdminPin } from "./actions";
import PasswordInput from "@/components/PasswordInput";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function SettingsPage() {
  const session = await auth();
  const isOwner = session?.user?.role === "OWNER";

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const me = session?.user?.id
    ? await prisma.adminUser.findUnique({ where: { id: session.user.id }, select: { pinHash: true } })
    : null;
  const hasPin = !!me?.pinHash;

  return (
    <div className="max-w-xl">
      <PageHeader title="Settings" />

      <Card className="p-6">
      <form action={updateSettings} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Shift start
            </label>
            <input
              name="shiftStartTime"
              type="time"
              defaultValue={settings.shiftStartTime}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Pay period starts on
              </label>
              <select
                name="payPeriodStartDay"
                defaultValue={settings.payPeriodStartDay}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
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

            <div className="border-t border-slate-200 pt-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">
                Production pay (by operation day)
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                For employees on the &quot;Production&quot; pay type: the full amount for each day
                worked, depending on whether that date is a Cooking or Jar Filling day. If someone
                leaves early or works a half day, add a &quot;Half day&quot; deduction on their payslip.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    ["cookingDayRate", "Cooking day (₱)", Number(settings.cookingDayRate)],
                    ["jarFillingDayRate", "Jar filling day (₱)", Number(settings.jarFillingDayRate)],
                  ] as const
                ).map(([name, label, value]) => (
                  <div key={name}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <input
                      name={name}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={value}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                    />
                  </div>
                ))}
              </div>
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

        <Button type="submit" className="w-full">Save Settings</Button>
      </form>
      </Card>

      <Card className="p-6 mt-6">
      <form action={changePassword} className="space-y-4">
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
        <Button type="submit" variant="secondary" className="w-full">Change Password</Button>
      </form>
      </Card>

      <Card className="p-6 mt-6">
      <form action={setAdminPin} className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Admin PIN login</h2>
        <p className="text-xs text-slate-500">
          {hasPin
            ? "A PIN is set for your account: you can sign in with just the PIN from the login page. Enter a new PIN to change it, or leave it blank to remove it."
            : "Set a 6-digit PIN to sign in with just the PIN, without typing your email and password."}{" "}
          Five wrong PINs in a row lock PIN login for 15 minutes.
        </p>
        <PasswordInput
          name="pin"
          label={hasPin ? "New PIN (blank to remove)" : "PIN"}
          autoComplete="off"
          required={false}
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="6 digits"
        />
        <PasswordInput
          name="currentPassword"
          label="Current password"
          autoComplete="current-password"
        />
        <Button type="submit" variant="secondary" className="w-full">
          {hasPin ? "Update or Remove PIN" : "Set PIN"}
        </Button>
      </form>
      </Card>
    </div>
  );
}
