import Link from "next/link";

const CARDS = [
  {
    href: "/kiosk",
    title: "Employee Attendance",
    subtitle: "Time in, time out, and breaks",
    accent: "border-green-200 hover:border-green-400",
    iconBg: "bg-green-100 text-green-700",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    href: "/employee",
    title: "Employee Dashboard",
    subtitle: "Your attendance history and payslips",
    accent: "border-sky-200 hover:border-sky-400",
    iconBg: "bg-sky-100 text-sky-700",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
  {
    href: "/sanitation",
    title: "Sanitation Inspection & Schedule",
    subtitle: "Who's in charge of what today",
    accent: "border-amber-200 hover:border-amber-400",
    iconBg: "bg-amber-100 text-amber-700",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 flex items-center justify-between gap-3 py-4 px-4 sm:px-6">
        <h1 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
          The Famous Pastil Republic
        </h1>
        <Link
          href="/admin"
          className="shrink-0 rounded-md bg-slate-900 text-white px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium hover:bg-slate-800"
        >
          Admin Login
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-10">
        <div className="w-full max-w-md flex flex-col gap-4">
          {CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`flex items-center gap-4 rounded-2xl bg-white border-2 ${card.accent} shadow-sm hover:shadow-md transition px-6 py-6`}
            >
              <span className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${card.iconBg}`}>
                {card.icon}
              </span>
              <span>
                <span className="block text-lg font-semibold text-slate-900">{card.title}</span>
                <span className="block text-sm text-slate-500">{card.subtitle}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
