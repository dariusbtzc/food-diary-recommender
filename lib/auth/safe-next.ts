// Turns an untrusted ?next= value into a same-origin path, so the login flow
// can't be used as an open redirect. Anything doubtful falls back to "/".
const BASE = "http://internal.invalid";

export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next === "") return "/";
  // Must be a root-relative path. "//host" and "/\host" are protocol-relative
  // in browsers, and control characters can smuggle either past the checks.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  // Don't bounce back into the auth flow itself.
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return "/";

  return url.pathname + url.search + url.hash;
}
