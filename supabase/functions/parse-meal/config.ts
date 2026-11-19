// Every tunable of the parse worker (brief, Flow 2; docs/m2-plan.md, decisions).
export const config = {
  model: "claude-haiku-5-5",
  // Brief: hard limit. Thinking is off, so all of it goes to the answer.
  maxTokens: 600,
  // Haiku 5.5's default, set explicitly. Thinking off is allowed up to "high".
  effort: "medium",
  // At or above: done. Below, or no place: needs_review.
  doneThreshold: 0.7,
  // Messages per read, and how long a read message stays hidden.
  batchSize: 5,
  visibilityTimeoutSeconds: 120,
  // A meal is marked failed on its 3rd failed attempt.
  maxAttempts: 3,
  // Parse calls per owner per Singapore day.
  dailyParseLimit: 50,
  // Singapore has no daylight saving: SGT is always UTC+8.
  sgtOffsetHours: 8,
  photoBucket: "meal-photos",
} as const;
