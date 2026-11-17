import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Vercel sends CRON_SECRET as `Authorization: Bearer <secret>` on cron calls.
const cronSecretSchema = z.string().min(1);
const authorizationSchema = z.string().max(1024);

// True only when the header is exactly `Bearer <secret>`. An unset or empty
// secret refuses every request, so `Bearer undefined` can never match.
export function isAuthorizedCron(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  const parsedSecret = cronSecretSchema.safeParse(secret);
  const parsedHeader = authorizationSchema.safeParse(authorization);
  if (!parsedSecret.success || !parsedHeader.success) return false;

  const expected = Buffer.from(`Bearer ${parsedSecret.data}`);
  const actual = Buffer.from(parsedHeader.data);
  // timingSafeEqual throws on unequal lengths; the length itself isn't secret.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
