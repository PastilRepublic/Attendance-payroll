import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col bg-slate-100">
      <div className="bg-slate-900 text-white flex items-center justify-between gap-3 py-4 px-4 sm:px-6">
        <h1 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight">
          The Famous Pastil Republic
        </h1>
        <Link
          href="/admin"
          className="shrink-0 rounded-md bg-white border border-slate-300 text-slate-900 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium hover:bg-slate-50"
        >
          Admin Login
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
        <Link
          href="/kiosk"
          className="rounded-lg bg-slate-900 text-white px-10 py-8 text-xl font-semibold hover:bg-slate-800"
        >
          Employee Attendance
        </Link>
        <Link
          href="/employee"
          className="rounded-lg bg-white border border-slate-300 text-slate-800 px-10 py-8 text-xl font-semibold hover:bg-slate-50"
        >
          Employee Dashboard
        </Link>
        <Link
          href="/sanitation"
          className="rounded-lg bg-white border border-slate-300 text-slate-800 px-10 py-8 text-xl font-semibold hover:bg-slate-50"
        >
          Sanitation Inspection &amp; Schedule
        </Link>
      </div>
    </div>
  );
}
