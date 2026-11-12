"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Chat" },
  { href: "/usuals", label: "Usuals" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex items-center gap-1 rounded-full border border-[#e4e0d6] bg-white p-1"
    >
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              active
                ? "bg-[#315e51] text-white"
                : "text-[#777b74] hover:bg-[#f7f6f1]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
