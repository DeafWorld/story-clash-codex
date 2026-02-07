import { NextResponse } from "next/server";
import { getGameState } from "../../../../lib/store";

export async function GET(_: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const gameState = getGameState(code.toUpperCase());
    return NextResponse.json(gameState);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Game not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
