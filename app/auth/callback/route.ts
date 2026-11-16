import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

// The magic link lands here with a PKCE ?code=. Exchanging it sets the
// session cookies; the auth.users trigger has already created the self person.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    console.error("exchangeCodeForSession failed", { status: error.status, code: error.code });
  }

  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
