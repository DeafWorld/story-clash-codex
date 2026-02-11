const DEFAULT_TTL_SECONDS = 60 * 60 * 6;

export type ShareTokenPayload = {
  code: string;
  exp: number;
};

function shareSecret(): string {
  return process.env.SHARE_PROXY_SECRET?.trim() || "dev-share-secret-change-me";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bytes = base64ToBytes(padded);
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

async function sign(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Crypto subtle API unavailable");
  }

  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(shareSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createShareToken(code: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  const payload: ShareTokenPayload = {
    code: code.toUpperCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyShareToken(token: string): Promise<ShareTokenPayload | null> {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await sign(encodedPayload);
  const provided = base64ToBytes(signature.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(signature.length / 4) * 4, "="));
  const computed = base64ToBytes(
    expectedSignature
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(expectedSignature.length / 4) * 4, "=")
  );

  if (!timingSafeEqual(provided, computed)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as ShareTokenPayload;
    if (!parsed.code || !parsed.exp) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
