"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Chip } from "@/components/Chip";
import { PhotoPicker } from "@/components/PhotoPicker";
import { StarRating } from "@/components/StarRating";
import { mealTypeAt, quickLogHeading } from "@/lib/meals/meal-type";
import { buildMealPayload, canSave, saveErrorMessage, type QuickLogState } from "@/lib/meals/payload";
import { PhotoDecodeError } from "@/lib/photos/compress";
import { uploadMealPhoto } from "@/lib/photos/upload";
import { MAX_RAW_TEXT_LENGTH } from "@/lib/validation/meal";

export interface Person {
  id: string;
  name: string;
  isSelf: boolean;
}

interface Photo {
  file: File;
  previewUrl: string;
  // Set once uploaded, so a retry after a failed save doesn't upload again.
  path?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving"; step: "photo" | "meal" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

// The current minute, client-side only: the server renders no time, so the
// header can't mismatch on hydration, and it stays current while open.
function subscribeToMinutes(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);
const noMinuteOnServer = () => null;

export function QuickLogForm({ people }: { people: Person[] }) {
  const selfIds = people.filter((p) => p.isSelf).map((p) => p.id);
  const [state, setState] = useState<QuickLogState>({ text: "", attendeeIds: selfIds, ratings: {} });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const minute = useSyncExternalStore(subscribeToMinutes, currentMinute, noMinuteOnServer);
  const heading = minute === null ? " " : quickLogHeading(new Date(minute * 60_000));

  // Revoke the preview's blob URL when it is replaced or the form unmounts.
  const previewUrl = photo?.previewUrl ?? null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const saving = status.kind === "saving";
  const selected = new Set(state.attendeeIds);
  const attendees = people.filter((p) => selected.has(p.id));

  function edit(update: (s: QuickLogState) => QuickLogState) {
    setState(update);
    if (status.kind === "saved" || status.kind === "error") setStatus({ kind: "idle" });
  }

  function toggle(personId: string) {
    edit((s) => ({
      ...s,
      // Keep the order people appear in, not the order they were tapped.
      attendeeIds: selected.has(personId)
        ? s.attendeeIds.filter((id) => id !== personId)
        : people.filter((p) => p.id === personId || selected.has(p.id)).map((p) => p.id),
    }));
  }

  async function save() {
    if (!canSave(state, photo !== null) || saving) return;
    setStatus({ kind: "saving", step: photo && !photo.path ? "photo" : "meal" });

    let photoPath = photo?.path;
    if (photo && !photoPath) {
      try {
        photoPath = await uploadMealPhoto(photo.file);
        const uploaded = photoPath;
        setPhoto((p) => (p ? { ...p, path: uploaded } : p));
      } catch (error) {
        setStatus({
          kind: "error",
          message:
            error instanceof PhotoDecodeError
              ? error.message
              : "The photo didn't upload. Check your connection and try again.",
        });
        return;
      }
      setStatus({ kind: "saving", step: "meal" });
    }

    const payload = buildMealPayload(state, { photoPath, mealType: mealTypeAt(new Date()) });
    let response: Response;
    try {
      response = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      setStatus({ kind: "error", message: "You seem to be offline. Try again when you're connected." });
      return;
    }
    if (!response.ok) {
      setStatus({ kind: "error", message: saveErrorMessage(response.status) });
      return;
    }

    setState({ text: "", attendeeIds: selfIds, ratings: {} });
    setPhoto(null);
    setStatus({ kind: "saved" });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <header className="flex flex-col gap-1">
        <p className="text-meta text-muted">{heading}</p>
        <h1 className="font-display text-display">Log a meal</h1>
      </header>

      <PhotoPicker
        previewUrl={previewUrl}
        disabled={saving}
        onPick={(file) => {
          setPhoto({ file, previewUrl: URL.createObjectURL(file) });
          if (status.kind !== "saving") setStatus({ kind: "idle" });
        }}
        onRemove={() => setPhoto(null)}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="meal-text" className="text-label">
          What did you have?
        </label>
        {/* 16 px text stops iOS Safari zooming in on focus. */}
        <input
          id="meal-text"
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={MAX_RAW_TEXT_LENGTH}
          placeholder="e.g. laksa w/ Jane at Katong, $12"
          value={state.text}
          disabled={saving}
          onChange={(event) => {
            const text = event.target.value;
            edit((s) => ({ ...s, text }));
          }}
          className="min-h-12 rounded-control border border-hairline bg-surface px-4 text-base placeholder:text-muted focus:border-pandan focus:outline-none"
        />
      </div>

      <fieldset className="flex flex-col gap-2" disabled={saving}>
        <legend className="mb-2 text-label">Who was there?</legend>
        {people.length === 0 ? (
          <p className="text-meta text-chilli">No people found. Sign out and in again, or check your data.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {people.map((person) => (
              <Chip
                key={person.id}
                label={person.name}
                selected={selected.has(person.id)}
                onToggle={() => toggle(person.id)}
              />
            ))}
          </div>
        )}
      </fieldset>

      {attendees.length > 0 ? (
        <fieldset
          className="flex flex-col rounded-card border border-hairline bg-surface px-4 pt-3 pb-1"
          disabled={saving}
        >
          <legend className="sr-only">How was it? Optional</legend>
          <p aria-hidden="true" className="text-label">
            How was it? <span className="font-normal text-muted">Optional</span>
          </p>
          {attendees.map((person) => (
            <div key={person.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-body">{person.name}</span>
              <StarRating
                name={`rating-${person.id}`}
                label={`${person.name}'s rating`}
                value={state.ratings[person.id]}
                onChange={(score) =>
                  edit((s) => ({ ...s, ratings: { ...s.ratings, [person.id]: score } }))
                }
              />
            </div>
          ))}
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={saving || !canSave(state, photo !== null)}
          className="min-h-13 rounded-card bg-pandan px-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {status.kind === "saving"
            ? status.step === "photo"
              ? "Uploading photo…"
              : "Saving…"
            : "Save meal"}
        </button>

        <div aria-live="polite" className="text-center">
          {status.kind === "error" ? (
            <p role="alert" className="text-meta text-chilli">
              {status.message}
            </p>
          ) : status.kind === "saved" ? (
            <p className="text-label text-pandan">Meal saved.</p>
          ) : null}
        </div>
        {/* The design's "Dishes and place fill in automatically in a few seconds."
            returns in M2, when the parse-meal worker makes it true. */}
      </div>
    </form>
  );
}
