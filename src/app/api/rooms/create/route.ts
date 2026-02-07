import { NextResponse } from "next/server";
import { z } from "zod";
import { containsProfanity } from "../../../../lib/profanity";
import { createRoom } from "../../../../lib/store";

const createSchema = z.object({
  name: z.string().trim().min(1).max(12),
});

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());

    if (containsProfanity(body.name)) {
      return NextResponse.json({ error: "Name contains blocked language" }, { status: 400 });
    }

    const created = createRoom(body.name);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
