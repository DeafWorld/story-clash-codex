import { NextResponse } from "next/server";
import { z } from "zod";
import { containsProfanity } from "../../../../lib/profanity";
import { joinRoom } from "../../../../lib/store";

const joinSchema = z.object({
  code: z.string().trim().min(4).max(4),
  name: z.string().trim().min(1).max(12),
});

export async function POST(request: Request) {
  try {
    const body = joinSchema.parse(await request.json());

    if (containsProfanity(body.name)) {
      return NextResponse.json({ error: "Name contains blocked language" }, { status: 400 });
    }

    const joined = joinRoom(body.code, body.name);
    return NextResponse.json(joined, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join room";
    const status = message.includes("full") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
