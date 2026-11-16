"use server";

import { headers } from "next/headers";

import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { magicLinkSchema } from "@/lib/validation/auth";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  // Server Actions reject cross-origin POSTs, so Origin is this app's own.
  // Supabase Auth also checks the link against its redirect allow list.
  const origin = (await headers()).get("origin");
  if (!origin) {
    return { status: "error", message: "Couldn't send the link. Try again." };
  }

  const callback = new URL("/auth/callback", origin);
  const next = safeNextPath(parsed.data.next);
  if (next !== "/") callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) {
    // Don't echo auth error details back to the page.
    console.error("signInWithOtp failed", { status: error.status, code: error.code });
    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "Couldn't send the link. Try again.",
    };
  }

  return { status: "sent", email: parsed.data.email };
}
