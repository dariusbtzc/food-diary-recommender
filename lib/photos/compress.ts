import {
  PHOTO_CONTENT_TYPE,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_EDGE,
  PHOTO_MIN_EDGE,
  PHOTO_QUALITY_STEPS,
  PHOTO_SHRINK_FACTOR,
  PHOTO_TARGET_BYTES,
} from "./constants";

export class PhotoDecodeError extends Error {
  constructor(cause?: unknown) {
    super("This photo can't be read. Try a JPEG or PNG.", { cause });
    this.name = "PhotoDecodeError";
  }
}

export class PhotoTooLargeError extends Error {
  constructor(bytes: number) {
    super(`Photo is still ${bytes} bytes after compression.`);
    this.name = "PhotoTooLargeError";
  }
}

export interface Size {
  width: number;
  height: number;
}

// A decoded image that can be re-encoded as JPEG at a given size and quality.
// The browser implementation draws to a canvas; tests pass a fake.
export interface EncodableImage extends Size {
  encode(width: number, height: number, quality: number): Promise<Blob>;
}

// Scales so the long edge is at most maxEdge. Never upscales.
export function fitWithin(size: Size, maxEdge: number): Size {
  const longEdge = Math.max(size.width, size.height);
  if (longEdge <= maxEdge) return { width: size.width, height: size.height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

// Steps quality down at each size, then shrinks, until the JPEG fits the target.
// If nothing fits, returns the smallest result as long as the bucket accepts it.
export async function compressImage(image: EncodableImage): Promise<Blob> {
  let size = fitWithin(image, PHOTO_MAX_EDGE);
  let smallest: Blob | undefined;

  for (;;) {
    for (const quality of PHOTO_QUALITY_STEPS) {
      const blob = await image.encode(size.width, size.height, quality);
      if (blob.size <= PHOTO_TARGET_BYTES) return blob;
      if (!smallest || blob.size < smallest.size) smallest = blob;
    }
    const next = fitWithin(size, Math.floor(Math.max(size.width, size.height) * PHOTO_SHRINK_FACTOR));
    if (Math.max(next.width, next.height) < PHOTO_MIN_EDGE) break;
    size = next;
  }

  // The outer loop always runs once, so smallest is set.
  if (!smallest || smallest.size > PHOTO_MAX_BYTES) throw new PhotoTooLargeError(smallest?.size ?? 0);
  return smallest;
}

// Browser only. Re-encoding through a canvas also drops EXIF, including GPS.
export async function compressPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new PhotoDecodeError(error);
  }

  const canvas = document.createElement("canvas");
  try {
    return await compressImage({
      width: bitmap.width,
      height: bitmap.height,
      encode: (width, height, quality) => {
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return Promise.reject(new PhotoDecodeError());
        context.drawImage(bitmap, 0, 0, width, height);
        return new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new PhotoDecodeError())),
            PHOTO_CONTENT_TYPE,
            quality,
          ),
        );
      },
    });
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
