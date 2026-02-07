import { jwtVerify } from "jose";

const SESSION_COOKIE = "hs_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function verifySessionCookie(token?: string | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<{ user_id: string }>(token, getSecret());
    if (!payload.user_id) return null;
    return { userId: payload.user_id };
  } catch {
    return null;
  }
}

export const sessionCookieName = SESSION_COOKIE;
