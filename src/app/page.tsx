import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-100 px-4">
      <div className="flex gap-4">
        <Link
          href="/kiosk"
          className="rounded-lg bg-slate-900 text-white px-8 py-6 text-lg font-semibold hover:bg-slate-800"
        >
          Open Kiosk
        </Link>
        <Link
          href="/admin"
          className="rounded-lg bg-white border border-slate-300 text-slate-900 px-8 py-6 text-lg font-semibold hover:bg-slate-50"
        >
          Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
