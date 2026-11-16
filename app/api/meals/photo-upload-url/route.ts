import { NextResponse } from "next/server";

import { MEAL_PHOTOS_BUCKET, PHOTO_EXTENSION } from "@/lib/photos/constants";
import { createClient } from "@/lib/supabase/server";

// Issues a signed upload URL for one meal photo. The server picks the path
// ({uid}/{uuid}.jpg), so the client can't write outside its own folder; the
// storage insert policy enforces the same under RLS. No request body.
export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const path = `${userId}/${crypto.randomUUID()}.${PHOTO_EXTENSION}`;
  const { data, error } = await supabase.storage.from(MEAL_PHOTOS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadUrl failed", { message: error?.message });
    return NextResponse.json({ error: "upload_url_failed" }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
