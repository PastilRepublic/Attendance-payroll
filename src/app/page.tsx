import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col bg-slate-100">
      <div className="bg-slate-900 text-white text-center py-4 px-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          The Famous Pastil Republic
        </h1>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="flex gap-4">
          <Link
            href="/kiosk"
            className="rounded-lg bg-slate-900 text-white px-8 py-6 text-lg font-semibold hover:bg-slate-800"
          >
            Employee Attendance
          </Link>
          <Link
            href="/admin"
            className="rounded-lg bg-white border border-slate-300 text-slate-900 px-8 py-6 text-lg font-semibold hover:bg-slate-50"
          >
            Admin Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
