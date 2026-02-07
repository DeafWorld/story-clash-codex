import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#1a1a1d",
        surface: "#26262a",
        cyan: "#00d9ff",
        danger: "#ff3b3b",
        success: "#39ff14",
        muted: "#a0a0a5"
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 217, 255, 0.4)",
        card: "inset 0 1px 0 rgba(255,255,255,0.08), 0 14px 30px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
} satisfies Config;
