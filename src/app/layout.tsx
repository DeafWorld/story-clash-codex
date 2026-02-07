import type { Metadata } from "next";
import SoundToggle from "../components/sound-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Story Clash",
  description: "Multiplayer story battles with realtime choices and social chaos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SoundToggle />
        {children}
      </body>
    </html>
  );
}
