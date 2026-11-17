"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/tailor", label: "Tailor Resume" },
  { href: "/prompts", label: "Prompt Library" },
  { href: "/tracker", label: "Job Tracker" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-5">
        <div className="text-lg font-semibold text-slate-900">Resume Tailor</div>
        <div className="text-xs text-slate-500">Runs locally</div>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
