"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/app/confess", label: "Confess" },
  { href: "/app/decide", label: "Decide" },
  { href: "/app/ask", label: "Ask" },
];

export default function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-3">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`btn ${active ? "btn-primary" : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
