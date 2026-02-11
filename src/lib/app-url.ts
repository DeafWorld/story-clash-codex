function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveAppUrlFromRequest(request: Request): string {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return stripTrailingSlash(configured);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto || (host?.startsWith("localhost") ? "http" : "https");

  if (!host) {
    return "http://localhost:3000";
  }
  return `${protocol}://${stripTrailingSlash(host)}`;
}
