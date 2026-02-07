const BLOCKED_WORDS = ["fuck", "shit", "bitch", "asshole", "nigger", "faggot"];

export function containsProfanity(value: string): boolean {
  const normalized = value.toLowerCase();
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
}

export function sanitizeDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 12);
}
