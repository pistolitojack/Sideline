// Server-side: load a coach's real content pieces and shape them for the
// Review UI. Poster images come from private storage via short-lived
// signed URLs.

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
  format: string | null;
  edl: {
    in?: number;
    out?: number;
    type?: string;
    captions?: { text: string; style?: string }[];
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
      "id, format, edl, render_asset_id, hook, caption, hashtags, cta, why, suggested_slot, suggested_sound, status, skip_reason, created_at, sessions!inner(coach_id)"
    )
    .eq("sessions.coach_id", coachId)
    .in("status", ["ready", "approved", "skipped", "downloaded"])
    .order("created_at", { ascending: true });

  if (!rows?.length) return [];

  // Signed URLs for poster frames (Phase 4) / renders (Phase 5).
  const assetIds = rows
    .map((r) => (r as unknown as Row).render_asset_id)
    .filter((v): v is string => Boolean(v));
  const paths: Record<string, string> = {};
  if (assetIds.length) {
    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, storage_path")
      .in("id", assetIds);
    for (const a of assets ?? []) paths[a.id] = a.storage_path;
  }
  const urls: Record<string, string> = {};
  await Promise.all(
    Object.entries(paths).map(async ([id, path]) => {
      const { data } = await supabase.storage
        .from("raw")
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) urls[id] = data.signedUrl;
    })
  );

  return rows.map((raw) => {
    const r = raw as unknown as Row;
    const cutLen = Math.max(0, (r.edl?.out ?? 0) - (r.edl?.in ?? 0));
    const slot = r.suggested_slot || "This week";
    const day = DAY_INDEX[slot.slice(0, 3).toLowerCase()] ?? 0;
    const words = (r.edl?.captions ?? [])
      .map((c) => c.text)
      .filter(Boolean)
      .slice(0, 6);
    return {
      id: r.id,
      kind: r.format === "story" ? "Story" : "Reel",
      type: TYPE_LABEL[r.edl?.type ?? ""] ?? "Teaching",
      img: r.render_asset_id ? urls[r.render_asset_id] ?? "" : "",
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
  });
}
