"use client";

import { useEffect } from "react";
import { usePremium } from "@/lib/use-premium";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdSlot({ slot }: { slot: string }) {
  const premium = usePremium();
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  useEffect(() => {
    if (!client || premium) return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // ignore
    }
  }, [client, premium]);

  if (!client || premium || !slot) return null;

  return (
    <div className="glass card">
      <div className="section-title">Advertisement</div>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
