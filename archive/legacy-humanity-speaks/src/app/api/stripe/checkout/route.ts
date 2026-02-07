import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { logError, logEvent } from "@/lib/logger";
import { checkContentSafety } from "@/lib/moderation";

function getOrigin(request: Request) {
  return request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function POST(request: Request) {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const body = await request.json().catch(() => null);
  const baseSchema = z.object({ type: z.enum(["premium", "boost", "sponsored"]) });
  const baseParsed = baseSchema.safeParse(body);
  if (!baseParsed.success) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 });
  }
  const type = baseParsed.data.type;

  if (!type) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 });
  }

  const origin = getOrigin(request);

  if (type === "premium") {
    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ error: "Missing premium price" }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { user_id: userId },
      },
      success_url: `${origin}/app/confess?upgrade=success`,
      cancel_url: `${origin}/app/confess?upgrade=cancel`,
      metadata: { user_id: userId, type },
    });

    logEvent("stripe_checkout_premium", { userId, sessionId: session.id });
    return NextResponse.json({ url: session.url });
  }

  if (type === "boost") {
    const priceId = process.env.STRIPE_BOOST_PRICE_ID;
    const boostSchema = z.object({ confession_id: z.string().uuid() });
    const boostParsed = boostSchema.safeParse(body);
    if (!priceId || !boostParsed.success) {
      return NextResponse.json({ error: "Missing boost data" }, { status: 400 });
    }
    const confessionId = boostParsed.data.confession_id;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app/confess?boost=success`,
      cancel_url: `${origin}/app/confess?boost=cancel`,
      metadata: { user_id: userId, type, confession_id: confessionId },
    });

    logEvent("stripe_checkout_boost", { userId, confessionId, sessionId: session.id });
    return NextResponse.json({ url: session.url });
  }

  if (type === "sponsored") {
    const sponsoredSchema = z.object({
      tier: z.number().int(),
      question_text: z.string().min(3).max(140),
      option_a: z.string().min(1).max(40),
      option_b: z.string().min(1).max(40),
    });
    const sponsoredParsed = sponsoredSchema.safeParse(body);
    if (!sponsoredParsed.success) {
      return NextResponse.json({ error: "Missing sponsored data" }, { status: 400 });
    }
    const { tier, question_text, option_a, option_b } = sponsoredParsed.data;
    if (![99, 199, 499].includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const safety = await checkContentSafety(`${question_text} ${option_a} ${option_b}`);
    if (!safety.allowed) {
      return NextResponse.json({ error: "Content not allowed" }, { status: 400 });
    }

    const priceMap: Record<number, string | undefined> = {
      99: process.env.STRIPE_SPONSORED_99_PRICE_ID,
      199: process.env.STRIPE_SPONSORED_199_PRICE_ID,
      499: process.env.STRIPE_SPONSORED_499_PRICE_ID,
    };

    const priceId = priceMap[tier];
    if (!priceId) {
      return NextResponse.json({ error: "Missing sponsored price" }, { status: 500 });
    }

    const { data: order, error } = await supabaseAdmin
      .from("sponsored_orders")
      .insert({
        user_id: userId,
        question_text,
        option_a,
        option_b,
        tier,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !order) {
      logError("stripe.sponsored_order_failed", { error: error?.message });
      return NextResponse.json({ error: "Unable to create sponsored order" }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/admin?order=success`,
      cancel_url: `${origin}/admin?order=cancel`,
      metadata: { user_id: userId, type, sponsored_order_id: order.id },
    });

    await supabaseAdmin
      .from("sponsored_orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);

    logEvent("stripe_checkout_sponsored", { userId, orderId: order.id, sessionId: session.id });
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
