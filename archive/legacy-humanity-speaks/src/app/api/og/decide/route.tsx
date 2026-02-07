import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const question = searchParams.get("question") || "Coffee or Tea?";
  const optionA = searchParams.get("a") || "Coffee";
  const optionB = searchParams.get("b") || "Tea";
  const percentA = searchParams.get("pa") || "50";
  const percentB = searchParams.get("pb") || "50";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: "linear-gradient(135deg, #131426 0%, #2b1a38 50%, #1b304a 100%)",
          color: "white",
          padding: "60px",
          fontSize: 36,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
          <div
            style={{
              fontSize: 20,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: "#4be1ff",
            }}
          >
            Humanity Speaks
          </div>
          <div style={{ fontSize: 44, fontWeight: 600 }}>{question}</div>
          <div style={{ display: "flex", gap: 20 }}>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 18, textTransform: "uppercase", letterSpacing: "0.2em" }}>{optionA}</div>
              <div style={{ fontSize: 42, color: "#4be1ff" }}>{percentA}%</div>
            </div>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 18, textTransform: "uppercase", letterSpacing: "0.2em" }}>{optionB}</div>
              <div style={{ fontSize: 42, color: "#ff6b88" }}>{percentB}%</div>
            </div>
          </div>
          <div style={{ fontSize: 20, color: "#a6a2bf" }}>Global decision</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
