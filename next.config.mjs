import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Playwright hits the dev server via 127.0.0.1; allow it to load /_next assets without warnings.
  allowedDevOrigins: ["http://127.0.0.1:3100", "http://localhost:3100", "http://127.0.0.1:3000", "http://localhost:3000"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: false,
  hideSourceMaps: true,
});
