import type { Metadata } from "next";
import Script from "next/script";
import SoundToggle from "../components/sound-toggle";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Story Clash",
  description: "Multiplayer story battles with realtime choices and social chaos.",
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
        <SoundToggle />
        {children}
      </body>
    </html>
  );
}
