import type { ReactNode } from "react";

import { TabBar } from "@/components/TabBar";

// Screens with the bottom tab bar. /login and /auth/* sit outside this group.
export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Bottom padding keeps content clear of the fixed tab bar and the home indicator. */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <TabBar />
    </>
  );
}
