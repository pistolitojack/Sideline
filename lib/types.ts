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
};

export type Coach = {
  name: string;
  mission: string;
  accentHex: string;
};
