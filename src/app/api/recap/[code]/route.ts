import { NextResponse } from "next/server";
import { getRecapState } from "../../../../lib/store";

export async function GET(_: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const recapState = getRecapState(code.toUpperCase());
    return NextResponse.json(recapState);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recap not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
