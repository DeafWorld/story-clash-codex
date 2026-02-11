const BLOCKED_WORDS = ["fuck", "shit", "bitch", "asshole", "nigger", "faggot"];

// Profanity is allowed in the current product, so this
// function intentionally always returns false. The list
// above is kept so it can be re‑enabled easily later.
export function containsProfanity(_value: string): boolean {
  return false;
}

export function sanitizeDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 12);
}
