import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import RatingWidget from "@/components/admin/RatingWidget";

export const dynamic = "force-dynamic";

type Segment = { asset_id?: string; in: number; out: number; transition?: string };
type Caption = { text: string; t0: number; t1: number; style?: string };

export default async function AdminSessionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/login");
  const { id } = await params;
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!session) redirect("/admin/sessions");

  const { data: coach } = await supabase
    .from("coaches")
    .select("name, sport, mission, audience, city, accent_hex, tones")
    .eq("id", session.coach_id)
    .maybeSingle();

  const { data: pieces } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("session_id", id)
    .order("created_at");

  // Sign the poster + rendered video for each piece.
  const assetIds = new Set<string>();
  for (const p of pieces ?? []) {
    if (p.render_asset_id) assetIds.add(p.render_asset_id);
    if (p.edl?.poster_asset_id) assetIds.add(p.edl.poster_asset_id);
  }
  const paths: Record<string, string> = {};
  if (assetIds.size) {
    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, storage_path")
      .in("id", [...assetIds]);
    for (const a of assets ?? []) paths[a.id] = a.storage_path;
  }
  const sign = async (path?: string) => {
    if (!path) return "";
    const { data } = await supabase.storage
      .from("raw")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? "";
  };
  const media = Object.fromEntries(
    await Promise.all(
      [...assetIds].map(async (aid) => [aid, await sign(paths[aid])] as const)
    )
  );

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Link
        href="/admin/sessions"
        className="text-sm text-neutral-500 hover:underline"
      >
        ← all sessions
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-xl font-semibold">
          {coach?.name ?? "—"}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {new Date(session.created_at).toLocaleString()}
          </span>
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {coach?.sport} · {coach?.audience} · {coach?.city ?? "no city"} ·
          mission: {coach?.mission}
        </p>
      </header>

      <Section title="What the coach asked for">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">prompt</dt>
          <dd>
            {session.prompt?.trim() ? (
              <span>“{session.prompt.trim()}”</span>
            ) : (
              <span className="text-neutral-400">
                none — the AI decided on its own
              </span>
            )}
          </dd>
          {/* These land with Phase 3 item 3; shown as soon as they exist. */}
          {"prompt_chip" in session && (
            <>
              <dt className="text-neutral-500">chip</dt>
              <dd>{session.prompt_chip ?? "—"}</dd>
              <dt className="text-neutral-500">source</dt>
              <dd>{session.prompt_source ?? "—"}</dd>
            </>
          )}
          <dt className="text-neutral-500">status</dt>
          <dd>{session.status}</dd>
        </dl>
      </Section>

      <Section title="The director's plan">
        {session.plan ? (
          <pre className="max-h-96 overflow-auto rounded-lg bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
            {JSON.stringify(session.plan, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-neutral-400">No plan recorded.</p>
        )}
      </Section>

      <h2 className="mt-8 mb-3 text-lg font-semibold">
        Pieces ({pieces?.length ?? 0})
      </h2>

      <div className="space-y-6">
        {(pieces ?? []).map((p) => {
          const segments: Segment[] = Array.isArray(p.edl?.segments)
            ? p.edl.segments
            : [];
          const captions: Caption[] = Array.isArray(p.edl?.captions)
            ? p.edl.captions
            : [];
          const total = segments.reduce(
            (s, x) => s + (Number(x.out) - Number(x.in)),
            0
          );
          const flags: string[] = Array.isArray(p.flags) ? p.flags : [];
          const video = p.render_asset_id ? media[p.render_asset_id] : "";
          const poster = p.edl?.poster_asset_id
            ? media[p.edl.poster_asset_id]
            : "";

          return (
            <article
              key={p.id}
              className="rounded-xl border border-neutral-200 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-white">
                  {p.piece_kind ?? p.edl?.type ?? "reel"}
                </span>
                <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-neutral-600">
                  {p.status}
                </span>
                <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-neutral-600">
                  {segments.length} {segments.length === 1 ? "shot" : "shots"} ·{" "}
                  {total.toFixed(1)}s
                </span>
                {p.reviewed_at && (
                  <span
                    className="rounded-full border border-neutral-200 px-2 py-0.5 text-neutral-600"
                    title="How the coach reviewed it (Phase 3.5 — never shown to them)"
                  >
                    {p.review_dwell_ms != null
                      ? `${(p.review_dwell_ms / 1000).toFixed(1)}s to decide`
                      : "reviewed"}
                    {p.detail_opened ? " · opened detail" : ""}
                    {p.revision_count ? ` · ${p.revision_count} revision${p.revision_count === 1 ? "" : "s"}` : ""}
                  </span>
                )}
                {flags.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
                    title="Automatic scorecard flag"
                  >
                    {f}
                  </span>
                ))}
                {!flags.length && (
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                    no flags
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                <div className="sm:w-52 sm:shrink-0">
                  {video ? (
                    <video
                      src={video}
                      poster={poster || undefined}
                      controls
                      playsInline
                      preload="none"
                      className="w-full rounded-lg bg-black"
                    />
                  ) : poster ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={poster}
                      alt=""
                      className="w-full rounded-lg bg-black"
                    />
                  ) : (
                    <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-neutral-100 text-xs text-neutral-400">
                      not rendered
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-3 text-sm">
                  <Field label="hook">{p.hook}</Field>
                  <Field label="caption">{p.caption}</Field>
                  <Field label="cta">{p.cta}</Field>
                  <Field label="hashtags">{p.hashtags}</Field>
                  <Field label="why this piece">{p.director_intent}</Field>
                  {p.skip_reason && (
                    <Field label="skip reason">{p.skip_reason}</Field>
                  )}
                  {p.skip_reason_text && (
                    <Field label="coach's note">“{p.skip_reason_text}”</Field>
                  )}
                  <Field label="shot lengths">
                    {segments
                      .map((s) => (Number(s.out) - Number(s.in)).toFixed(1))
                      .join("s | ") + "s"}
                  </Field>
                  <Field label="caption beats">
                    {captions.length
                      ? captions
                          .map(
                            (c) =>
                              `${c.style ?? "body"} ${Number(c.t0).toFixed(1)}–${Number(c.t1).toFixed(1)}s`
                          )
                          .join(" · ")
                      : "none"}
                  </Field>
                </div>
              </div>

              <RatingWidget
                pieceId={p.id}
                initial={{
                  hook_rating: p.hook_rating ?? null,
                  pacing_rating: p.pacing_rating ?? null,
                  copy_rating: p.copy_rating ?? null,
                  would_post_rating: p.would_post_rating ?? null,
                  founder_notes: p.founder_notes ?? "",
                }}
              />
            </article>
          );
        })}
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}
