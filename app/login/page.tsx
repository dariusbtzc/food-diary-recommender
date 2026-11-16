import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Food Diary" };

// Fixed messages keyed by code, so ?error= can't put arbitrary text on the page.
const LINK_ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Send a new one.",
};

// Minimal until the style-guide tokens land in the app-shell task.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-5">
      <h1 className="text-3xl font-bold">Food Diary</h1>
      {/* searchParams is request data, so it streams in after the static shell. */}
      <Suspense fallback={<LoginForm />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginFormWithParams({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      linkError={typeof error === "string" ? LINK_ERRORS[error] : undefined}
    />
  );
}
