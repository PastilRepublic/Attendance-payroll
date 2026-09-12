import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

const navItems = [
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/settings", label: "Settings" },
];

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/admin/login" });
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/admin/attendance" className="font-semibold">
              Attendance &amp; Payroll
            </Link>
            <nav className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 text-sm rounded-md hover:bg-slate-800"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <span>{session?.user?.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-sm"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
