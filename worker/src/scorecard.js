// Phase 3.1 — the objective scorecard.
//
// Structural checks that run on every finished piece before the coach ever
// sees it. These are DETECTORS, not opinions: each one either fired or it
// didn't. No severity, no score, no judgment about whether a piece is good —
// only whether it is structurally broken in a way we can prove from the JSON.
//
// This exists because the only quality signal this project ever had was Jack
// watching finished reels, which costs minutes and real money per subjective
// data point. Anything checkable here is checkable in milliseconds, for free,
// on every piece, forever.
//
// Deliberately has NO imports and no I/O: it is pure, so it can be tested
// exhaustively without a database, an API key, or a video.

// Floating-point slack. Segment and caption times come from model output via
// JSON, so exact equality is never safe — two shots that meet at 6.0s must not
// read as overlapping.
const EPS = 0.01;

const PIECE_MIN_SEC = 5;
const SEGMENT_MIN_SEC = 0.5;
const HOOK_MAX_WORDS = 8;

const dur = (s) => Number(s.out) - Number(s.in);

// Do two [a0,a1) / [b0,b1) ranges genuinely share time?
const overlaps = (a0, a1, b0, b1) =>
  Math.min(Number(a1), Number(b1)) - Math.max(Number(a0), Number(b0)) > EPS;

/**
 * Returns a sorted array of flag strings — empty when the piece is clean.
 *
 * @param {object}   piece
 * @param {object}   piece.edl               the stored EDL ({segments, captions})
 * @param {string}   piece.hook              the written hook
 * @param {number}   piece.targetLengthSec   the director's target for this piece
 */
export function scorePiece({ edl, hook, targetLengthSec } = {}) {
  const flags = new Set();

  const segments = Array.isArray(edl?.segments) ? edl.segments : [];
  const captions = Array.isArray(edl?.captions) ? edl.captions : [];

  const usable = segments.filter(
    (s) => Number.isFinite(Number(s?.in)) && Number.isFinite(Number(s?.out)),
  );
  const totalDur = usable.reduce((sum, s) => sum + dur(s), 0);

  // — piece length —
  if (totalDur < PIECE_MIN_SEC) flags.add("piece_too_short");

  // — segment length —
  for (const s of usable) {
    if (dur(s) < SEGMENT_MIN_SEC) {
      flags.add("segment_too_short");
      break;
    }
  }

  // A single shot eating half the piece is only wrong when the piece was
  // supposed to be a multi-shot cut — a one-segment piece IS the whole piece.
  const target = Number(targetLengthSec);
  if (usable.length > 1 && Number.isFinite(target) && target > 0) {
    for (const s of usable) {
      if (dur(s) > target / 2 + EPS) {
        flags.add("segment_too_long");
        break;
      }
    }
  }

  // — the same footage cut in twice —
  outer: for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i];
      const b = usable[j];
      if (
        a.asset_id &&
        a.asset_id === b.asset_id &&
        overlaps(a.in, a.out, b.in, b.out)
      ) {
        flags.add("footage_repeated");
        break outer;
      }
    }
  }

  // — captions sharing the screen —
  const caps = captions.filter(
    (c) => Number.isFinite(Number(c?.t0)) && Number.isFinite(Number(c?.t1)),
  );
  outer2: for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      if (overlaps(caps[i].t0, caps[i].t1, caps[j].t0, caps[j].t1)) {
        flags.add("captions_overlap");
        break outer2;
      }
    }
  }

  // — a caption still on screen after the video ends —
  for (const c of caps) {
    if (Number(c.t1) > totalDur + EPS) {
      flags.add("captions_run_past_end");
      break;
    }
  }

  // — hook length —
  const words = String(hook ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > HOOK_MAX_WORDS) flags.add("hook_too_long");

  return [...flags].sort();
}
