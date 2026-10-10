import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { auth } from "@/lib/auth";
import { updateSettingsForm, changePasswordForm, setAdminPinForm, addOwnerAccountForm, updateMyNameForm } from "./actions";
import PasswordInput from "@/components/PasswordInput";
import SoftHeader from "@/components/ui/SoftHeader";
import SoftCard from "@/components/ui/SoftCard";
import PillButton from "@/components/ui/PillButton";

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
    ? await prisma.adminUser.findUnique({ where: { id: session.user.id }, select: { pinHash: true, name: true } })
    : null;
  const hasPin = !!me?.pinHash;
  const owners = isOwner
    ? await prisma.adminUser.findMany({
        where: { role: "OWNER" },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, active: true },
      })
    : [];

  return (
    <div className="max-w-xl">
      <SoftHeader title="Settings" />

      <SoftCard>
      <ActionForm action={updateSettingsForm} successMessage="Saved" className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              Shift start
            </label>
            <input
              name="shiftStartTime"
              type="time"
              defaultValue={settings.shiftStartTime}
              className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              Shift end
            </label>
            <input
              name="shiftEndTime"
              type="time"
              defaultValue={settings.shiftEndTime}
              className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
          </div>
        </div>

        {isOwner && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Unpaid break (minutes)
                </label>
                <input
                  name="unpaidLunchMinutes"
                  type="number"
                  min="0"
                  defaultValue={settings.unpaidLunchMinutes}
                  className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Also the kiosk&apos;s Break allowance -- an employee who Starts Break and takes
                  longer than this to End Break/Lunch is flagged &quot;Late from break&quot;.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  Regular hours cap / day
                </label>
                <input
                  name="regularHoursCapPerDay"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue={Number(settings.regularHoursCapPerDay)}
                  className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Hours worked beyond this are tracked as OT hours for reference, but are not
                  automatically paid -- add a manual Bonus adjustment on the payslip if you want to
                  compensate them.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                Late grace period (minutes)
              </label>
              <input
                name="gracePeriodMinutes"
                type="number"
                min="0"
                defaultValue={settings.gracePeriodMinutes}
                className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                Pay period starts on
              </label>
              <select
                name="payPeriodStartDay"
                defaultValue={settings.payPeriodStartDay}
                className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
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
                    <label className="mb-1 block text-sm font-medium text-slate-800">{label}</label>
                    <input
                      name={name}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={value}
                      className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
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

        <PillButton type="submit" className="w-full">Save Settings</PillButton>
      </ActionForm>
      </SoftCard>

      <SoftCard className="mt-6">
        <h2 className="text-lg font-medium text-slate-900">Your name</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Shown next to everything you add or void in Finance, and on the owners&apos; share.
        </p>
        <ActionForm action={updateMyNameForm} successMessage="Name saved" className="mt-4 space-y-3">
          <input
            name="name"
            required
            maxLength={40}
            defaultValue={me?.name ?? ""}
            aria-label="Your name"
            className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
          <PillButton type="submit" variant="secondary" className="w-full">
            Save name
          </PillButton>
        </ActionForm>
      </SoftCard>

      <SoftCard className="mt-6">
      <ActionForm action={changePasswordForm} className="space-y-4">
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
        <PillButton type="submit" variant="secondary" className="w-full">Change Password</PillButton>
      </ActionForm>
      </SoftCard>

      <SoftCard className="mt-6">
      <ActionForm action={setAdminPinForm} successMessage="Saved" className="space-y-4">
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
        <PillButton type="submit" variant="secondary" className="w-full">
          {hasPin ? "Update or Remove PIN" : "Set PIN"}
        </PillButton>
      </ActionForm>
      </SoftCard>

      {isOwner && (
        <SoftCard className="mt-6">
          <h2 className="text-lg font-medium text-slate-900">Owner logins</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Each owner signs in with their own account, so Finance shows who added or voided every entry.
          </p>
          <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {owners.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium text-slate-800">{o.name}</span>
                <span className="text-slate-500">{o.email}</span>
              </li>
            ))}
          </ul>
          <ActionForm action={addOwnerAccountForm} resetOnSuccess successMessage="Owner login added" className="mt-5 space-y-3">
            <div className="text-sm font-medium text-slate-800">Add another owner</div>
            <input
              name="name"
              required
              placeholder="Name"
              className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Login email"
              className="w-full rounded-full border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
            <PasswordInput
              name="password"
              label="Temporary password"
              autoComplete="new-password"
              minLength={8}
              helperText="They can change it after signing in."
            />
            <PillButton type="submit" variant="secondary" className="w-full">
              Add owner login
            </PillButton>
          </ActionForm>
        </SoftCard>
      )}
    </div>
  );
}
