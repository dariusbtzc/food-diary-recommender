// The fixed cuisine list (brief, Key conventions). Shared by the parser, Meal
// detail, M3 onboarding and M4's Google-type mapping, so preferences learn
// under one name per cuisine. A dish that fits none gets null.
//
// Copied, not imported, in lib/cuisines.ts (Node). tests/repo-config.test.ts
// checks that the two lists match. Adding one is a code change, not a
// migration.
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
