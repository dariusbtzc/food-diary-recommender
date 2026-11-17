import { NextResponse } from "next/server";
import { z } from "zod";

import { classifyCreateMealError, isOwnPhotoPath, toCreateMealArgs } from "@/lib/meals/create";
import { createClient } from "@/lib/supabase/server";
import { createMealSchema } from "@/lib/validation/meal";

// Logs a meal. Saves the meals row (parse_status 'pending'), its attendees and
// their stated ratings in one transaction via create_meal(), with the user's
// client under RLS. No external calls; parsing is queued in M2.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createMealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const meal = parsed.data;

  if (meal.photo_path && !isOwnPhotoPath(meal.photo_path, userId)) {
    return NextResponse.json({ error: "invalid_photo_path" }, { status: 400 });
  }

  const { data: id, error } = await supabase.rpc("create_meal", toCreateMealArgs(meal));
  if (error || !id) {
    const failure = classifyCreateMealError(error?.code);
    // Log the code only, never the meal text or names.
    if (failure.status === 500) {
      console.error("create_meal failed", { code: error?.code });
    }
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  return NextResponse.json({ id, parse_status: "pending" }, { status: 201 });
}
