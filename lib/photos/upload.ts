import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { compressPhoto } from "./compress";
import { MEAL_PHOTOS_BUCKET, PHOTO_CONTENT_TYPE } from "./constants";

export const uploadUrlResponseSchema = z.object({
  path: z.string().min(1),
  token: z.string().min(1),
});

export class PhotoUploadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PhotoUploadError";
  }
}

// Browser only. Compresses the photo, asks the server for a signed upload URL,
// uploads straight to Storage, and returns the object path for POST /api/meals.
export async function uploadMealPhoto(file: Blob): Promise<string> {
  const photo = await compressPhoto(file);

  const response = await fetch("/api/meals/photo-upload-url", { method: "POST" });
  if (!response.ok) {
    throw new PhotoUploadError(`Upload URL request failed (${response.status}).`);
  }
  const parsed = uploadUrlResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new PhotoUploadError("Upload URL response was malformed.", { cause: parsed.error });
  }
  const { path, token } = parsed.data;

  const { error } = await createClient()
    .storage.from(MEAL_PHOTOS_BUCKET)
    .uploadToSignedUrl(path, token, photo, { contentType: PHOTO_CONTENT_TYPE });
  if (error) {
    throw new PhotoUploadError("Photo upload failed.", { cause: error });
  }
  return path;
}
