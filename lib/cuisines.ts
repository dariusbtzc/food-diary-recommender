// The fixed cuisine list (brief, Key conventions). A copy of
// supabase/functions/_shared/cuisines.ts: Node and Deno never import from each
// other, and tests/repo-config.test.ts checks that the two lists match.
export const CUISINES = [
  "chinese",
  "malay",
  "indian",
  "peranakan",
  "indonesian",
  "thai",
  "vietnamese",
  "japanese",
  "korean",
  "western",
  "italian",
  "french",
  "mediterranean",
  "middle eastern",
  "mexican",
  "fusion",
  "cafe",
  "dessert",
] as const;

export type Cuisine = (typeof CUISINES)[number];
