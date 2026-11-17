// The four bottom tabs (docs/app-ui.pdf). Pure, so it can be unit-tested.

export const TABS = [
  { id: "log", label: "Log", href: "/" },
  { id: "diary", label: "Diary", href: "/diary" },
  { id: "recommend", label: "Recommend", href: "/recommend" },
  { id: "people", label: "People", href: "/people" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

// "/" matches only itself; other tabs also own their nested screens,
// e.g. /diary/123 (Meal detail) keeps Diary active.
export function activeTab(pathname: string): TabId | null {
  for (const tab of TABS) {
    if (tab.href === "/") {
      if (pathname === "/") return tab.id;
    } else if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
      return tab.id;
    }
  }
  return null;
}
