import { describe, expect, it } from "vitest";

import { compressImage, fitWithin, PhotoTooLargeError, type EncodableImage } from "./compress";
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_EDGE,
  PHOTO_MIN_EDGE,
  PHOTO_QUALITY_STEPS,
  PHOTO_TARGET_BYTES,
} from "./constants";

type Call = { width: number; height: number; quality: number };

// Fake JPEG encoder: output size is pixels × quality × bytesPerPixel.
function fakeImage(width: number, height: number, bytesPerPixel: number) {
  const calls: Call[] = [];
  const image: EncodableImage = {
    width,
    height,
    async encode(w, h, quality) {
      calls.push({ width: w, height: h, quality });
      return new Blob([new Uint8Array(Math.round(w * h * quality * bytesPerPixel))]);
    },
  };
  return { image, calls };
}

describe("fitWithin", () => {
  it("scales a landscape image so the long edge is the max", () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales a portrait image by its height", () => {
    expect(fitWithin({ width: 3024, height: 4032 }, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("never upscales", () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("keeps at least one pixel on a very thin image", () => {
    expect(fitWithin({ width: 10000, height: 1 }, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe("compressImage", () => {
  it("resizes to max 1600 px and stops at the first quality under target", async () => {
    // 1600×1200 at 0.82 → ~157 KB with this rate.
    const { image, calls } = fakeImage(4032, 3024, 0.1);
    const blob = await compressImage(image);

    expect(calls).toEqual([{ width: PHOTO_MAX_EDGE, height: 1200, quality: PHOTO_QUALITY_STEPS[0] }]);
    expect(blob.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
  });

  it("steps quality down before shrinking", async () => {
    // 1600×1200 needs quality ≤ ~0.68 to fit.
    const { image, calls } = fakeImage(1600, 1200, 0.16);
    const blob = await compressImage(image);

    expect(calls.map((c) => c.quality)).toEqual([0.82, 0.72, 0.62]);
    expect(calls.every((c) => c.width === 1600)).toBe(true);
    expect(blob.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
  });

  it("shrinks dimensions when no quality fits", async () => {
    const { image, calls } = fakeImage(1600, 1200, 0.4);
    const blob = await compressImage(image);

    const last = calls.at(-1)!;
    expect(last.width).toBeLessThan(1600);
    expect(last.width / last.height).toBeCloseTo(4 / 3, 2);
    expect(blob.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
  });

  it("returns the smallest result when the target is unreachable but the bucket allows it", async () => {
    const { image, calls } = fakeImage(1600, 1200, 1.5);
    const blob = await compressImage(image);

    expect(blob.size).toBeGreaterThan(PHOTO_TARGET_BYTES);
    expect(blob.size).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
    expect(Math.min(...calls.map((c) => Math.max(c.width, c.height)))).toBeGreaterThanOrEqual(PHOTO_MIN_EDGE);
  });

  it("throws when even the smallest result is over the bucket limit", async () => {
    const { image } = fakeImage(1600, 1200, 10);
    await expect(compressImage(image)).rejects.toBeInstanceOf(PhotoTooLargeError);
  });
});
