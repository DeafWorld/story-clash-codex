import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const question = searchParams.get("question") || "What do you wish you knew at 20?";
  const answer = searchParams.get("answer") || "A verified human answered.";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: "linear-gradient(135deg, #101420 0%, #1d3d4e 60%, #2b1a38 100%)",
          color: "white",
          padding: "60px",
          fontSize: 34,
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
          <div style={{ fontSize: 36, fontWeight: 600 }}>{question}</div>
          <div style={{ fontSize: 46, lineHeight: 1.1 }}>{answer}</div>
          <div style={{ fontSize: 20, color: "#a6a2bf" }}>Verified human answer</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
