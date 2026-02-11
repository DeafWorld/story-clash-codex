import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getRecapState } from "../../../../lib/store";

const paramsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .regex(/^[A-Za-z0-9]+$/),
});

export async function GET(_: Request, context: { params: Promise<{ code: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const code = parsed.data.code.toUpperCase();
  try {
    const recapState = getRecapState(code);
    return NextResponse.json(recapState);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recap not found";
    logger.warn("api.recap.get.failed", { code, error });
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
