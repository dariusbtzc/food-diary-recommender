// Meal photo storage and compression settings. The brief: private bucket,
// photos resized to max 1600 px, ~200 KB each.

export const MEAL_PHOTOS_BUCKET = "meal-photos";

export const PHOTO_CONTENT_TYPE = "image/jpeg";
export const PHOTO_EXTENSION = "jpg";

// Long edge, in pixels.
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_TARGET_BYTES = 200 * 1024;
// Mirrors the bucket's file_size_limit in the storage migration.
export const PHOTO_MAX_BYTES = 1024 * 1024;

// JPEG qualities tried in order at each size before shrinking further.
export const PHOTO_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.5] as const;
// When no quality hits the target, scale both edges by this and retry.
export const PHOTO_SHRINK_FACTOR = 0.8;
// Stop shrinking below this long edge; settle for the smallest result.
export const PHOTO_MIN_EDGE = 640;
