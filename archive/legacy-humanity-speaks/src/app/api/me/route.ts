import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { isPremiumUser } from "@/lib/subscriptions";

export async function GET() {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const premium = await isPremiumUser(userId);
  return NextResponse.json({ premium });
}
