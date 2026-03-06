import { NextResponse } from "next/server";
import { suggestBeat } from "@/lib/ai-copilot";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomCode?: string;
      beatIndex?: number;
      recentBeats?: string[];
    };
    const result = await suggestBeat({
      roomCode: body.roomCode,
      beatIndex: body.beatIndex,
      recentBeats: body.recentBeats,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to suggest beat",
      },
      { status: 400 }
    );
  }
}
