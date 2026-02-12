import type { Metadata } from "next";
import Script from "next/script";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/app-meta";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: `${SITE_TAGLINE} Compete in a reflex minigame, take turns shaping a branching horror story, and survive to the recap.`,
  metadataBase: new URL(appUrl),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  return (
    <html lang="en">
      <body>
        {plausibleDomain ? (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
