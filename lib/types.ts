// Shared types for content pieces shown in the app.
// In later phases these rows come from the Supabase `content_pieces` table;
// in Phase 1 Demo Mode they are seeded from lib/demo.ts.

export type PieceStatus = "ready" | "approved" | "skipped" | "downloaded";

export type Piece = {
  id: number | string; // number = demo seed, string = content_pieces uuid
  sessionId?: string | null; // owning session (real pieces only)
  kind: "Reel" | "Story";
  type: string; // Teaching | Hype | Story | Behind the scenes | ...
  img: string; // poster image (public path or signed URL)
  videoUrl?: string | null; // signed URL of the rendered video (Phase 5)
  downloadUrl?: string | null; // same video as attachment download
  dur: string;
  platforms: string[];
  slot: string;
  day: number; // 0 = Monday ... 6 = Sunday
  words: string[]; // burned-caption words cycled on the card
  hook: string;
  caption: string;
  tags: string;
  cta: string;
  why: string;
  status: PieceStatus;
  skipReason?: string | null;
  rendering?: boolean; // video not rendered yet (render_asset_id is null)
  // The video file was deleted by the retention policy — skipped reels after a
  // day, approved ones after 60. The piece itself is untouched: hook, caption,
  // hashtags and CTA are all still here, and the AI's memory of it never
  // depended on the file. Distinct from `rendering`, which means the opposite
  // (a video is on its way); without the distinction a cleared reel would sit
  // telling the coach it was still rendering, forever.
  cleared?: boolean;
  revisions?: { note: string; at: string }[]; // what the coach has asked to change
};

export type Coach = {
  name: string;
  mission: string;
  accentHex: string;
  city?: string | null;
};
