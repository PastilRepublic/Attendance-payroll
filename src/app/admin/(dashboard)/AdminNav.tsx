"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The admin menu as pill tabs; the page you are on is the dark pill. */
export default function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex w-full gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
