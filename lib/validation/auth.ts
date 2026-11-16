import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  next: z.string().max(2048).optional(),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
