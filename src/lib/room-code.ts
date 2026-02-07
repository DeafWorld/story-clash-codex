const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_CODE_REGEX = /^[A-HJ-NP-Z]{4}$/;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    const index = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[index];
  }
  return code;
}

export function validateRoomCode(code: string, exists?: (value: string) => boolean) {
  const normalized = code.trim().toUpperCase();
  const formatValid = ROOM_CODE_REGEX.test(normalized);
  const existsResult = formatValid && exists ? exists(normalized) : false;
  return {
    normalized,
    formatValid,
    exists: existsResult,
  };
}
