"use client";

export type InviteContext = {
  code: string;
  origin: string;
  roomLabel?: string;
  inviter?: string;
};

export type InviteResult = {
  method: "native" | "clipboard";
  url: string;
};

function sanitizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function sanitizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function buildInviteUrl(context: InviteContext): string {
  const code = sanitizeCode(context.code);
  const origin = sanitizeOrigin(context.origin);
  const inviter = context.inviter?.trim().slice(0, 24) ?? "";
  const params = new URLSearchParams({ code, from: "invite" });
  if (inviter) {
    params.set("inviter", inviter);
  }
  return `${origin}/join?${params.toString()}`;
}

export function buildInviteText(context: InviteContext): string {
  const code = sanitizeCode(context.code);
  const roomSuffix = context.roomLabel ? ` (${context.roomLabel})` : "";
  const inviterPrefix = context.inviter ? `${context.inviter} invited you to ` : "Join ";
  return `${inviterPrefix}Story Clash room ${code}${roomSuffix}.`;
}

export async function shareInvite(context: InviteContext): Promise<InviteResult> {
  const url = buildInviteUrl(context);
  const text = buildInviteText(context);
  const payload: ShareData = {
    title: "Story Clash Invite",
    text,
    url,
  };

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return { method: "native", url };
    } catch {
      // Fall through to clipboard on unsupported/error cases.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return { method: "clipboard", url };
  }

  throw new Error("Sharing unavailable on this device");
}
