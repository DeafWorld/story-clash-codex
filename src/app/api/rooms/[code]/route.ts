import { NextResponse } from "next/server";
import { getRoomView } from "../../../../lib/store";

export async function GET(_: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const room = getRoomView(code.toUpperCase());
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Room not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
