const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_CODE_LENGTH = 4;

export function generateRoomCode(): string {
  let result = "";
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    result += LETTERS[bytes[i] % LETTERS.length];
  }
  return result;
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(value: string): boolean {
  return /^[A-HJ-NP-Z]{4}$/.test(normalizeRoomCode(value));
}
