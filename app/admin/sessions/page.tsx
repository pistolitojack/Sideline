import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  created_at: string;
  status: string | null;
  prompt: string | null;
  coach_id: string;
  coaches: { name: string | null } | { name: string | null }[] | null;
};

const coachName = (c: SessionRow["coaches"]) =>
  (Array.isArray(c) ? c[0]?.name : c?.name) ?? "—";

export default async function AdminSessions() {
  if (!hasSupabaseEnv()) redirect("/login");
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("id, created_at, status, prompt, coach_id, coaches(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const sessions = (sessionRows ?? []) as unknown as SessionRow[];

  // Piece counts, flag counts and rating progress, in one pass.
  const { data: pieces } = await supabase
    .from("content_pieces")
    .select("session_id, status, flags, would_post_rating");

  const stats = new Map<
    string,
    { pieces: number; flags: number; rated: number }
  >();
  for (const p of pieces ?? []) {
    const s = stats.get(p.session_id) ?? { pieces: 0, flags: 0, rated: 0 };
    s.pieces += 1;
    s.flags += Array.isArray(p.flags) ? p.flags.length : 0;
    if (p.would_post_rating != null) s.rated += 1;
    stats.set(p.session_id, s);
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every session, newest first. Internal tool — coaches never see this.
        </p>
      </header>

      {!sessions.length && (
        <p className="rounded-lg border border-neutral-200 p-6 text-sm text-neutral-500">
          No sessions yet.
        </p>
      )}

      <ul className="space-y-2">
        {sessions.map((s) => {
          const st = stats.get(s.id) ?? { pieces: 0, flags: 0, rated: 0 };
          return (
            <li key={s.id}>
              <Link
                href={`/admin/sessions/${s.id}`}
                className="block rounded-lg border border-neutral-200 p-4 transition hover:border-neutral-400"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{coachName(s.coaches)}</span>
                  <span className="text-xs text-neutral-500">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{s.status ?? "—"}</Badge>
                  <Badge>
                    {st.pieces} {st.pieces === 1 ? "piece" : "pieces"}
                  </Badge>
                  {st.flags > 0 && (
                    <Badge tone="warn">
                      {st.flags} {st.flags === 1 ? "flag" : "flags"}
                    </Badge>
                  )}
                  {st.pieces > 0 && (
                    <Badge tone={st.rated === st.pieces ? "ok" : undefined}>
                      {st.rated}/{st.pieces} rated
                    </Badge>
                  )}
                </div>
                <p className="mt-2 line-clamp-1 text-sm text-neutral-600">
                  {s.prompt?.trim()
                    ? `“${s.prompt.trim()}”`
                    : "no prompt — AI decided"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "warn" | "ok";
}) {
  const cls =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : tone === "ok"
        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
        : "border-neutral-200 bg-neutral-50 text-neutral-600";
  return (
    <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{children}</span>
  );
}
