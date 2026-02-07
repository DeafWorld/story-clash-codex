import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text") || "A verified human shared a confession.";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: "linear-gradient(135deg, #1d1a2b 0%, #101826 60%, #1b304a 100%)",
          color: "white",
          padding: "60px",
          fontSize: 36,
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 20,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: "#ffb347",
            }}
          >
            Humanity Speaks
          </div>
          <div style={{ fontSize: 46, fontWeight: 600, lineHeight: 1.1 }}>{text}</div>
          <div style={{ fontSize: 20, color: "#a6a2bf" }}>Verified human confession</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
