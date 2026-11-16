"use client";

import { useActionState } from "react";

import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next, linkError }: { next?: string; linkError?: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p>
          We sent a sign-in link to <strong>{state.email}</strong>. Open it on this
          device.
        </p>
      </div>
    );
  }

  const message = state.status === "error" ? state.message : linkError;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="email" className="font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        className="rounded-lg border border-current/20 px-3 py-2 text-base"
      />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {message ? (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );
}
