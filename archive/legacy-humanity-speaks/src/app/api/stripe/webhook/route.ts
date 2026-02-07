import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { logError, logEvent } from "@/lib/logger";

export async function POST(request: Request) {
  const signature = headers().get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
  }

  const payload = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    logError("stripe.webhook_signature_failed");
    return NextResponse.json({ error: "Webhook signature failed" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};
    const type = metadata.type;

    if (type === "boost" && metadata.confession_id) {
      const boostedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from("confessions")
        .update({ boosted_until: boostedUntil })
        .eq("id", metadata.confession_id);
      logEvent("stripe_boost_completed", { confessionId: metadata.confession_id });
    }

    if (type === "sponsored" && metadata.sponsored_order_id) {
      const { data: order } = await supabaseAdmin
        .from("sponsored_orders")
        .select("question_text, option_a, option_b")
        .eq("id", metadata.sponsored_order_id)
        .maybeSingle();

      if (order) {
        await supabaseAdmin
          .from("binary_questions")
          .update({ status: "archived" })
          .eq("status", "active");

        const { data: created } = await supabaseAdmin.from("binary_questions").insert({
          question_text: order.question_text,
          option_a: order.option_a,
          option_b: order.option_b,
          status: "active",
          sponsored: true,
          sponsored_order_id: metadata.sponsored_order_id,
          featured_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }).select("id").single();

        if (created?.id) {
          await supabaseAdmin
            .from("sponsored_orders")
            .update({ binary_question_id: created.id })
            .eq("id", metadata.sponsored_order_id);
        }
      }

      await supabaseAdmin
        .from("sponsored_orders")
        .update({ status: "active" })
        .eq("id", metadata.sponsored_order_id);
      logEvent("stripe_sponsored_activated", { orderId: metadata.sponsored_order_id });
    }

    if (type === "premium" && session.subscription && metadata.user_id) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      await supabaseAdmin.from("subscriptions").upsert({
        user_id: metadata.user_id,
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      });
      logEvent("stripe_premium_started", { userId: metadata.user_id });
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await supabaseAdmin.from("subscriptions").upsert({
      user_id: subscription.metadata?.user_id,
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    });
    logEvent("stripe_subscription_updated", { subscriptionId: subscription.id, status: subscription.status });
  }

  return NextResponse.json({ received: true });
}
