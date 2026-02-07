"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IDKitWidget, VerificationLevel } from "@worldcoin/idkit";
import {
  MiniKit,
  VerificationLevel as MiniKitVerificationLevel,
  type VerifyCommandInput,
} from "@worldcoin/minikit-js";

export default function VerifyCard() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
  const action = process.env.NEXT_PUBLIC_WLD_ACTION;

  const miniKitAvailable = MiniKit.isInstalled();

  const verifyPayload: VerifyCommandInput | null = useMemo(() => {
    if (!appId || !action) return null;
    return {
      action,
      signal: "humanity-speaks",
      verification_level: MiniKitVerificationLevel.Orb,
    };
  }, [action, appId]);

  async function verifyWithMiniKit() {
    if (!verifyPayload) return;
    if (!MiniKit.isInstalled()) return;
    setStatus("verifying");
    const { finalPayload } = await MiniKit.commandsAsync.verify(verifyPayload);
    if (!finalPayload || finalPayload.status !== "success") {
      setStatus("error");
      return;
    }
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: finalPayload,
        action,
        signal: verifyPayload.signal,
      }),
    });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    router.push("/app/confess");
    router.refresh();
  }

  if (!appId || !action) {
    return (
      <div className="glass card">
        <p className="text-lg">Missing World ID environment variables.</p>
        <p className="muted mt-2 text-sm">Set NEXT_PUBLIC_WLD_APP_ID and NEXT_PUBLIC_WLD_ACTION.</p>
      </div>
    );
  }

  if (miniKitAvailable) {
    return (
      <div className="glass card flex flex-col gap-4">
        <div className="badge w-fit">World App Access</div>
        <h2 className="text-2xl md:text-3xl">Verify in World App.</h2>
        <p className="muted text-sm">
          You’re inside the World App. Use MiniKit to verify your humanity.
        </p>
        <button className="btn btn-primary w-fit" onClick={verifyWithMiniKit} disabled={status === "verifying"}>
          {status === "verifying" ? "Verifying…" : "Verify with World App"}
        </button>
        {status === "error" && (
          <p className="text-sm text-red-300">Verification failed. Try again.</p>
        )}
      </div>
    );
  }

  return (
    <IDKitWidget
      app_id={appId}
      action={action}
      verification_level={VerificationLevel.Orb}
      handleVerify={async (proof) => {
        setStatus("verifying");
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proof),
        });
        if (!res.ok) {
          setStatus("error");
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Verification failed");
        }
      }}
      onSuccess={() => {
        router.push("/app/confess");
        router.refresh();
      }}
      onError={() => setStatus("error")}
    >
      {({ open }) => (
        <div className="glass card flex flex-col gap-4">
          <div className="badge w-fit">Verified Human Access</div>
          <h2 className="text-2xl md:text-3xl">Prove you are human to enter.</h2>
          <p className="muted text-sm">
            Humanity Speaks is locked to verified humans only. One human, one voice.
          </p>
          <button className="btn btn-primary w-fit" onClick={open} disabled={status === "verifying"}>
            {status === "verifying" ? "Verifying…" : "Verify with World ID"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-300">Verification failed. Try again.</p>
          )}
        </div>
      )}
    </IDKitWidget>
  );
}
