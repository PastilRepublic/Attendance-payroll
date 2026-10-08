import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import AdminNav from "./AdminNav";
import { pillClass } from "@/components/ui/styles";

const navItems = [
  { href: "/admin/attendance", label: "Attendance", ownerOnly: false },
  { href: "/admin/employees", label: "Employees", ownerOnly: true },
  { href: "/admin/payroll", label: "Payroll", ownerOnly: true },
  { href: "/admin/inventory", label: "Inventory", ownerOnly: false },
  { href: "/admin/sanitation", label: "Sanitation", ownerOnly: false },
  { href: "/admin/settings", label: "Settings", ownerOnly: false },
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
  const isOwner = session?.user?.role === "OWNER";
  const visibleNavItems = navItems
    .filter((item) => !item.ownerOnly || isOwner)
    .map(({ href, label }) => ({ href, label }));

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
          <Link href="/admin/attendance" className="flex min-w-0 shrink-0 items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-base font-extrabold text-amber-400">
              PR
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold leading-tight text-slate-900">
                The Famous Pastil Republic
              </span>
              <span className="block truncate text-xs text-slate-500">Attendance &amp; payroll admin</span>
            </span>
          </Link>
          <div className="order-2 flex items-center gap-3 text-sm text-slate-500 sm:order-3">
            <span className="hidden max-w-[14rem] truncate lg:inline">{session?.user?.email}</span>
            <form action={signOutAction}>
              <button type="submit" className={pillClass("secondary", "sm")}>
                Sign out
              </button>
            </form>
          </div>
          <div className="w-full sm:order-2 sm:w-auto">
            <AdminNav items={visibleNavItems} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl overflow-x-hidden px-4 py-6">{children}</main>
    </div>
  );
}
