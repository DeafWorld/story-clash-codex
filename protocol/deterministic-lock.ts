export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicTieBreakChoice(params: {
  roomCode: string;
  beatIndex: number;
  topChoiceIds: string[];
}): string | null {
  const sorted = [...params.topChoiceIds].sort((left, right) => left.localeCompare(right));
  if (sorted.length === 0) {
    return null;
  }
  if (sorted.length === 1) {
    return sorted[0] ?? null;
  }
  const seed = `${params.roomCode}:${params.beatIndex}:${sorted.join(",")}`;
  const index = stableHash(seed) % sorted.length;
  return sorted[index] ?? sorted[0] ?? null;
}
