"use client";

import { useActionState } from "react";

import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next, linkError }: { next?: string; linkError?: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-card border border-hairline bg-surface p-5"
      >
        <h2 className="font-display text-title">Check your email</h2>
        <p className="text-body">
          We sent a sign-in link to <strong>{state.email}</strong>. Open it on this
          device.
        </p>
      </div>
    );
  }

  const message = state.status === "error" ? state.message : linkError;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-label">
        Email
      </label>
      {/* 16 px text stops iOS Safari zooming in on focus. */}
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="you@example.com"
        className="min-h-13 rounded-control border border-hairline bg-surface px-4 text-base placeholder:text-muted focus:border-pandan focus:outline-none"
      />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {message ? (
        <p role="alert" className="text-meta text-chilli">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 min-h-13 rounded-card bg-pandan px-4 text-[17px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );
}
