"use client";

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (explicit) {
    return normalizeBase(explicit);
  }
  if (typeof window !== "undefined") {
    return normalizeBase(window.location.origin);
  }
  return "";
}

export function apiUrl(path: string): string {
  const base = resolveApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    return normalizedPath;
  }
  return `${base}${normalizedPath}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
