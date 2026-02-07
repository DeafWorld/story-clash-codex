import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/logger";

const typeValues = ["confession", "ask_question", "ask_answer", "binary_question"] as const;

type ModerationType = (typeof typeValues)[number];

type ModerationItem = {
  id: string;
  type: ModerationType;
  content: string;
  flag_count: number;
  hidden: boolean;
  status?: string | null;
  created_at: string;
};

async function requireAdmin() {
  const { userId, response } = await requireUser();
  if (!userId) return { userId: null, response };
  const { data } = await supabaseAdmin
    .from("users")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.is_admin) {
    return { userId: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId, response: null };
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.userId) return admin.response!;

  const { searchParams } = new URL(request.url);
  const typeParamRaw = searchParams.get("type");
  const typeParam = typeValues.includes(typeParamRaw as ModerationType)
    ? (typeParamRaw as ModerationType)
    : null;
  const search = searchParams.get("search")?.trim();
  const onlyFlagged = searchParams.get("onlyFlagged") !== "false";

  const items: ModerationItem[] = [];

  const types = typeParam ? [typeParam] : typeValues;

  if (types.includes("confession")) {
    let query = supabaseAdmin
      .from("confessions")
      .select("id, content, flag_count, hidden, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (onlyFlagged) query = query.gt("flag_count", 0);
    if (search) query = query.ilike("content", `%${search}%`);
    const { data } = await query;
    data?.forEach((row) =>
      items.push({
        id: row.id,
        type: "confession",
        content: row.content,
        flag_count: row.flag_count,
        hidden: row.hidden,
        created_at: row.created_at,
      })
    );
  }

  if (types.includes("ask_question")) {
    let query = supabaseAdmin
      .from("ask_questions")
      .select("id, question_text, flag_count, hidden, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (onlyFlagged) query = query.gt("flag_count", 0);
    if (search) query = query.ilike("question_text", `%${search}%`);
    const { data } = await query;
    data?.forEach((row) =>
      items.push({
        id: row.id,
        type: "ask_question",
        content: row.question_text,
        flag_count: row.flag_count,
        hidden: row.hidden,
        status: row.status,
        created_at: row.created_at,
      })
    );
  }

  if (types.includes("ask_answer")) {
    let query = supabaseAdmin
      .from("ask_answers")
      .select("id, answer_text, flag_count, hidden, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (onlyFlagged) query = query.gt("flag_count", 0);
    if (search) query = query.ilike("answer_text", `%${search}%`);
    const { data } = await query;
    data?.forEach((row) =>
      items.push({
        id: row.id,
        type: "ask_answer",
        content: row.answer_text,
        flag_count: row.flag_count,
        hidden: row.hidden,
        created_at: row.created_at,
      })
    );
  }

  if (types.includes("binary_question")) {
    let query = supabaseAdmin
      .from("binary_questions")
      .select("id, question_text, flag_count, hidden, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (onlyFlagged) query = query.gt("flag_count", 0);
    if (search) query = query.ilike("question_text", `%${search}%`);
    const { data } = await query;
    data?.forEach((row) =>
      items.push({
        id: row.id,
        type: "binary_question",
        content: row.question_text,
        flag_count: row.flag_count,
        hidden: row.hidden,
        status: row.status,
        created_at: row.created_at,
      })
    );
  }

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.userId) return admin.response!;

  const body = await request.json().catch(() => null);
  const schema = z.object({
    action: z.enum(["hide", "unhide", "archive", "restore"]),
    items: z.array(
      z.object({
        type: z.enum(typeValues),
        id: z.string().uuid(),
      })
    ),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { action, items } = parsed.data;

  try {
    for (const item of items) {
      if (action === "hide" || action === "unhide") {
        const hidden = action === "hide";
        const table =
          item.type === "confession"
            ? "confessions"
            : item.type === "ask_question"
              ? "ask_questions"
              : item.type === "ask_answer"
                ? "ask_answers"
                : "binary_questions";
        await supabaseAdmin.from(table).update({ hidden }).eq("id", item.id);
      }

      if (action === "archive" || action === "restore") {
        if (item.type === "ask_question" || item.type === "binary_question") {
          const table = item.type === "ask_question" ? "ask_questions" : "binary_questions";
          const status = action === "archive" ? "archived" : "pending";
          await supabaseAdmin.from(table).update({ status }).eq("id", item.id);
        }
      }

      await supabaseAdmin.from("moderation_actions").insert({
        admin_user_id: admin.userId,
        content_type: item.type,
        content_id: item.id,
        action,
      });
    }
  } catch (error) {
    logError("admin.moderation_failed", { error: (error as Error).message });
    return NextResponse.json({ error: "Moderation failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
