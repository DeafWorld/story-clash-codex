import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyCloudProof } from "@worldcoin/minikit-js";
import { logError, logEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const appId = process.env.WORLD_ID_APP_ID || process.env.NEXT_PUBLIC_WLD_APP_ID;
    const action = process.env.WORLD_ID_ACTION || process.env.NEXT_PUBLIC_WLD_ACTION;

    if (!appId || !action) {
      return NextResponse.json({ error: "World ID not configured" }, { status: 500 });
    }

    const minikitSchema = z.object({
      payload: z.object({ nullifier_hash: z.string() }).passthrough(),
      signal: z.string().optional(),
      action: z.string().optional(),
    });
    const idkitSchema = z.object({ nullifier_hash: z.string() }).passthrough();

    if (minikitSchema.safeParse(body).success) {
      const signal = body?.signal;
      const verifyResult = await verifyCloudProof(body.payload, appId, action, signal);
      if (!verifyResult.success) {
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }

      const userId = body?.payload?.nullifier_hash;
      if (!userId) {
        return NextResponse.json({ error: "Missing nullifier_hash" }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from("users")
        .upsert({ user_id: userId }, { onConflict: "user_id" });
      if (error) {
        logError("verify.user_save_failed", { error: error.message });
        return NextResponse.json({ error: "Unable to save user" }, { status: 500 });
      }

      await setSessionCookie(userId);
      logEvent("verify_success", { userId });
      return NextResponse.json({ success: true });
    }

    if (!idkitSchema.safeParse(body).success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const verifyUrl =
      process.env.WORLD_ID_VERIFY_URL ||
      `https://developer.worldcoin.org/api/v1/verify/${appId}`;

    const verifyRes = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        action,
      }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      logError("verify.idkit_failed", { detail: verifyData?.detail });
      return NextResponse.json({ error: verifyData?.detail || "Verification failed" }, { status: 400 });
    }

    const userId = body?.nullifier_hash;
    const { error } = await supabaseAdmin
      .from("users")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (error) {
      logError("verify.user_save_failed", { error: error.message });
      return NextResponse.json({ error: "Unable to save user" }, { status: 500 });
    }

    await setSessionCookie(userId);

    logEvent("verify_success", { userId });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
