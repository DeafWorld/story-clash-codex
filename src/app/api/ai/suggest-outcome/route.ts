import { NextResponse } from "next/server";
import { suggestConsequence } from "@/lib/ai-copilot";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomCode?: string;
      beatIndex?: number;
      lockedChoiceLabel?: string | null;
      freeformSnippets?: string[];
    };
    const result = await suggestConsequence({
      roomCode: body.roomCode,
      beatIndex: body.beatIndex,
      lockedChoiceLabel: body.lockedChoiceLabel ?? null,
      freeformSnippets: body.freeformSnippets ?? [],
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to suggest consequence",
      },
      { status: 400 }
    );
  }
}
