// Server-side: load a coach's real content pieces and shape them for the
// Review UI. Poster images and rendered videos come from private storage
// via short-lived signed URLs.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Piece } from "./types";

const DAY_INDEX: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

type Row = {
  id: string;
  session_id: string;
  format: string | null;
  edl: {
    in?: number;
    out?: number;
    segments?: { in: number; out: number }[];
    type?: string;
    captions?: { text: string; style?: string }[];
    poster_asset_id?: string;
  } | null;
  render_asset_id: string | null;
  hook: string | null;
  caption: string | null;
  hashtags: string | null;
  cta: string | null;
  why: string | null;
  suggested_slot: string | null;
  suggested_sound: string | null;
  status: string;
  skip_reason: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  montage: "Montage",
  teaching: "Teaching",
  hype: "Hype",
  transformation: "Transformation",
  story: "Story",
  funny: "Funny",
  technique: "Technique",
};

export async function loadPieces(
  supabase: SupabaseClient,
  coachId: string
): Promise<Piece[]> {
  const { data: rows } = await supabase
    .from("content_pieces")
    .select(
      "id, session_id, format, edl, render_asset_id, hook, caption, hashtags, cta, why, suggested_slot, suggested_sound, status, skip_reason, created_at, sessions!inner(coach_id)"
    )
    .eq("sessions.coach_id", coachId)
    .in("status", ["ready", "approved", "skipped", "downloaded"])
    .order("created_at", { ascending: true });

  if (!rows?.length) return [];

  // Collect every render/poster asset referenced by the pieces.
  const assetIds = new Set<string>();
  for (const raw of rows) {
    const r = raw as unknown as Row;
    if (r.render_asset_id) assetIds.add(r.render_asset_id);
    if (r.edl?.poster_asset_id) assetIds.add(r.edl.poster_asset_id);
  }
  const paths: Record<string, string> = {};
  if (assetIds.size) {
    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, storage_path")
      .in("id", Array.from(assetIds));
    for (const a of assets ?? []) paths[a.id] = a.storage_path;
  }

  const sign = async (path: string, download = false) => {
    const { data } = await supabase.storage
      .from("raw")
      .createSignedUrl(path, 86400, download ? { download: true } : undefined);
    return data?.signedUrl ?? "";
  };

  return Promise.all(
    rows.map(async (raw) => {
      const r = raw as unknown as Row;
      const renderPath = r.render_asset_id ? paths[r.render_asset_id] : "";
      const posterPath = r.edl?.poster_asset_id
        ? paths[r.edl.poster_asset_id]
        : "";
      const isVideo = renderPath.endsWith(".mp4");

      const videoUrl = isVideo ? await sign(renderPath) : null;
      const downloadUrl = isVideo ? await sign(renderPath, true) : null;
      const img = posterPath
        ? await sign(posterPath)
        : !isVideo && renderPath
        ? await sign(renderPath)
        : "";

      const cutLen = r.edl?.segments?.length
        ? r.edl.segments.reduce((a, seg) => a + Math.max(0, seg.out - seg.in), 0)
        : Math.max(0, (r.edl?.out ?? 0) - (r.edl?.in ?? 0));
      const slot = r.suggested_slot || "This week";
      const day = DAY_INDEX[slot.slice(0, 3).toLowerCase()] ?? 0;
      const words = (r.edl?.captions ?? [])
        .map((c) => c.text)
        .filter(Boolean)
        .slice(0, 6);

      return {
        id: r.id,
        sessionId: r.session_id,
        kind: (r.format === "story" ? "Story" : "Reel") as Piece["kind"],
        type: TYPE_LABEL[r.edl?.type ?? ""] ?? "Teaching",
        img,
        videoUrl,
        downloadUrl,
        dur: `${Math.floor(cutLen / 60)}:${String(Math.round(cutLen % 60)).padStart(2, "0")}`,
        platforms: r.format === "story" ? ["IG Story"] : ["Reels", "TikTok"],
        slot,
        day,
        words: words.length ? words : [r.hook ?? "—"],
        hook: r.hook ?? "",
        caption: r.caption ?? "",
        tags: r.hashtags ?? "",
        cta: r.cta ?? "",
        why: r.why ?? "",
        status: r.status as Piece["status"],
        skipReason: r.skip_reason,
      };
    })
  );
}
