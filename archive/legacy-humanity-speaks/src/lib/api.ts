import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function requireUser() {
  const session = await getSessionUser();
  if (!session) {
    return { userId: null, response: json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { userId: session.userId, response: null };
}
