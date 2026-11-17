import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { QuickLogForm, type Person } from "./quick-log-form";

// Quick log (home). People come from the user's own rows under RLS.
export default function LogPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pt-8 pb-6">
      {/* People are request data, so they stream in after the static shell. */}
      <Suspense fallback={<QuickLogSkeleton />}>
        <QuickLog />
      </Suspense>
    </main>
  );
}

async function QuickLog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, name, is_self")
    .order("name");

  if (error) {
    console.error("people select failed", { code: error.code });
    return (
      <p role="alert" className="text-body text-chilli">
        Couldn&apos;t load your people. Refresh to try again.
      </p>
    );
  }

  // "You" first, then everyone else by name.
  const people: Person[] = data
    .map((p) => ({ id: p.id, name: p.name, isSelf: p.is_self }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

  return <QuickLogForm people={people} />;
}

function QuickLogSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-meta">&nbsp;</p>
        <h1 className="font-display text-display">Log a meal</h1>
      </div>
      <div className="h-36 rounded-card border border-hairline bg-surface" />
      <div className="h-12 rounded-control border border-hairline bg-surface" />
    </div>
  );
}
