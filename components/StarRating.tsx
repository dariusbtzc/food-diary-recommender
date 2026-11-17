"use client";

const STAR = "M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93L12 2.8z";

// Five stars as native radios, so keyboard and screen readers work for free.
// Tapping the current star clears it: ratings are optional.
export function StarRating({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <fieldset className="flex">
      <legend className="sr-only">{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value !== undefined && n <= value;
        return (
          <label key={n} className="flex size-11 cursor-pointer items-center justify-center">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              // A click on the already-checked radio fires no change event.
              onClick={() => {
                if (value === n) onChange(undefined);
              }}
              className="peer sr-only"
            />
            <span className="sr-only">
              {n} {n === 1 ? "star" : "stars"}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="28"
              height="28"
              strokeWidth="1.5"
              strokeLinejoin="round"
              className={`rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-pandan ${
                filled ? "fill-kaya stroke-kaya" : "fill-none stroke-muted"
              }`}
            >
              <path d={STAR} />
            </svg>
          </label>
        );
      })}
    </fieldset>
  );
}
