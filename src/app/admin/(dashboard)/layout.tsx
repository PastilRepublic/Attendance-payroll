import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

const navItems = [
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/tasks", label: "Tasks" },
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
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/attendance" className="font-semibold shrink-0">
            Attendance &amp; Payroll
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-300 order-2 sm:order-3">
            <span className="hidden sm:inline">{session?.user?.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-sm"
              >
                Sign out
              </button>
            </form>
          </div>
          <nav className="flex flex-wrap gap-1 w-full sm:w-auto sm:order-2">
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
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
