"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { activeTab, TABS, type TabId } from "./tabs";

// Outline icons, 1.8 px stroke (style guide).
const ICONS: Record<TabId, ReactNode> = {
  log: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  diary: (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
      <path d="M4.5 15.5h15" />
    </>
  ),
  recommend: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M21 20v-1a5 5 0 0 0-3.5-4.8" />
    </>
  ),
};

export function TabBar() {
  const current = activeTab(usePathname());

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[13px] ${
                  active ? "font-semibold text-pandan" : "font-medium text-muted"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[tab.id]}
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
