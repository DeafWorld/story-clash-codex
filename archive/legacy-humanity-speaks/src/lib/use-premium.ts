"use client";

import { useEffect, useState } from "react";

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

async function fetchPremium() {
  const res = await fetch("/api/me");
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.premium);
}

export function usePremium() {
  const [premium, setPremium] = useState<boolean | null>(cached);

  useEffect(() => {
    if (cached !== null) return;
    if (!pending) {
      pending = fetchPremium().then((value) => {
        cached = value;
        return value;
      });
    }
    pending.then((value) => setPremium(value));
  }, []);

  return premium;
}
