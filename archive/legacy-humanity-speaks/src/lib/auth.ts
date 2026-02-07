import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "hs_session";
const SESSION_TTL = "7d";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string) {
  const secret = getSecret();
  return new SignJWT({ user_id: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret);
}

export async function verifySessionToken(token?: string | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<{ user_id: string }>(token, getSecret());
    if (!payload.user_id) return null;
    return { userId: payload.user_id };
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function setSessionCookie(userId: string) {
  const token = await createSessionToken(userId);
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export const sessionCookieName = SESSION_COOKIE;
