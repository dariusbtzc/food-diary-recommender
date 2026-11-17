"use client";

// Toggle chip (style guide): pandan with a check when selected, white outline
// when not. Full pill, at least 44 px tall.
export function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-body font-semibold ${
        selected
          ? "border-pandan bg-pandan text-white"
          : "border-hairline bg-surface font-normal text-ink"
      }`}
    >
      {selected ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : null}
      {label}
    </button>
  );
}
