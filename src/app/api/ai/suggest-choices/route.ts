import { NextResponse } from "next/server";
import { suggestChoices } from "@/lib/ai-copilot";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomCode?: string;
      beatIndex?: number;
      currentBeatText?: string;
    };
    const result = await suggestChoices({
      roomCode: body.roomCode,
      beatIndex: body.beatIndex,
      currentBeatText: body.currentBeatText,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to suggest choices",
      },
      { status: 400 }
    );
  }
}
