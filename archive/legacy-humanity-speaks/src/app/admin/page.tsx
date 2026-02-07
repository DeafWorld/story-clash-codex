import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import AdminConsole from "@/components/AdminConsole";

export default async function AdminPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/");
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("is_admin")
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!user?.is_admin) {
    return (
      <div className="glass card">
        <h2 className="text-2xl">Admin access required.</h2>
        <p className="muted mt-2 text-sm">This area is restricted.</p>
      </div>
    );
  }

  const { data: sponsored } = await supabaseAdmin
    .from("sponsored_orders")
    .select(
      "id, question_text, option_a, option_b, tier, status, created_at, binary_question_id, binary_questions(votes_a, votes_b)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <AdminConsole />

      <section className="glass card">
        <div className="section-title">Sponsored questions</div>
        <ul className="mt-4 grid gap-3 text-sm">
          {sponsored?.length ? (
            sponsored.map((order) => (
              <li key={order.id}>
                <div className="text-lg">{order.question_text}</div>
                <div className="muted">
                  {order.option_a} / {order.option_b} · Tier ${order.tier} · {order.status}
                </div>
                {order.binary_questions && (
                  <div className="muted text-xs">
                    Votes: {order.binary_questions.votes_a} / {order.binary_questions.votes_b}
                  </div>
                )}
              </li>
            ))
          ) : (
            <li className="muted">No sponsored orders yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
