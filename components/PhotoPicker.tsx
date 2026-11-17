"use client";

import Image from "next/image";
import { useId } from "react";

// The dashed "Take or add a photo" tile. No `capture` attribute, so phones
// offer both the camera and the photo library. The parent owns the file and
// its preview URL.
export function PhotoPicker({
  previewUrl,
  disabled,
  onPick,
  onRemove,
}: {
  previewUrl: string | null;
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputId = useId();

  if (previewUrl) {
    return (
      <div className="relative h-48 overflow-hidden rounded-card border border-hairline bg-surface">
        {/* A local blob: URL, so there's nothing for the image optimiser to do. */}
        <Image src={previewUrl} alt="Selected meal photo" fill unoptimized className="object-cover" />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="absolute top-2 right-2 min-h-11 rounded-full bg-surface/95 px-4 text-label text-ink disabled:opacity-60"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={inputId}
      className="flex cursor-pointer flex-col items-center gap-2 rounded-card border-[1.5px] border-dashed border-muted/40 bg-surface px-4 py-6 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pandan"
    >
      <input
        id={inputId}
        type="file"
        accept="image/*"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so picking the same file again still fires a change.
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
      <span className="flex size-12 items-center justify-center rounded-full bg-pandan-tint text-pandan">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold">Take or add a photo</span>
      <span className="text-meta text-muted">Optional — a note works too</span>
    </label>
  );
}
