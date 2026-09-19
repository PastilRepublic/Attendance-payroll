import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";

function loginErrorUrl(callbackUrl: string, mode: "pin" | "password", error: string) {
  return `/admin/login?error=${error}&mode=${mode}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/admin");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(loginErrorUrl(callbackUrl, "password", "1"));
    }
    throw error;
  }
}

async function pinLoginAction(formData: FormData) {
  "use server";
  const pin = String(formData.get("pin") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/admin");

  try {
    await signIn("admin-pin", { pin, redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      const locked = (error as { code?: string }).code === "pin_locked";
      redirect(loginErrorUrl(callbackUrl, "pin", locked ? "locked" : "1"));
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/admin";
  const pinMode = params.mode === "pin";
  const otherModeHref = `/admin/login?mode=${pinMode ? "password" : "pin"}&callbackUrl=${encodeURIComponent(callbackUrl)}`;

  const errorMessage = !params.error
    ? null
    : params.error === "locked"
      ? "Too many wrong PINs. PIN login is locked for 15 minutes -- use your email and password instead."
      : pinMode
        ? "Incorrect PIN."
        : "Incorrect email or password.";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm mb-3">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← Home
        </Link>
      </div>
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Admin Login</h1>
        <p className="text-sm text-slate-500 mb-6">
          Attendance &amp; Payroll admin dashboard
        </p>

        {errorMessage && (
          <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">
            {errorMessage}
          </div>
        )}

        {pinMode ? (
          <form action={pinLoginAction} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <PasswordInput
              name="pin"
              label="Admin PIN"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="6-digit PIN"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800"
            >
              Sign in
            </button>
          </form>
        ) : (
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <PasswordInput name="password" label="Password" autoComplete="current-password" />
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800"
            >
              Sign in
            </button>
          </form>
        )}

        <Link
          href={otherModeHref}
          className="block text-center text-sm text-slate-500 hover:text-slate-700 mt-4"
        >
          {pinMode ? "Use email and password instead" : "Use a PIN instead"}
        </Link>
      </div>
    </div>
  );
}
