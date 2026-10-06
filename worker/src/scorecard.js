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

// SPEECH CHECKS — added after the first outside coach rejected a reel for "a
// sentence that was incomplete in the video". The scorecard flagged that piece
// for a long hook and missed the actual reason entirely: seven checks and not
// one asked whether a cut chopped the speaker off mid-flow.
//
// These are as objective as the rest. Deepgram returns word-level timings and
// we store `punctuated_word`, so "does this cut land inside a word" and "does
// this reel end mid-sentence" both have yes/no answers rather than opinions.

// A word still being spoken across a cut. Sliced by more than this and a
// listener hears half a syllable.
const WORD_SLICE_SEC = 0.06;

// Speech resuming this soon after the final cut means the speaker was still
// going — the reel ended on them rather than with them.
const SPEECH_CONTINUES_SEC = 0.35;

// Sentence-ending punctuation, allowing a trailing quote or bracket.
const ENDS_SENTENCE = /[.!?…]["')\]]*$/;

const dur = (s) => Number(s.out) - Number(s.in);

// Words belonging to one segment's source clip, in time order.
const wordsFor = (speech, assetId) => {
  const list = speech?.[assetId];
  return Array.isArray(list)
    ? list
        .filter(
          (w) => Number.isFinite(Number(w?.s)) && Number.isFinite(Number(w?.e)),
        )
        .sort((a, b) => Number(a.s) - Number(b.s))
    : [];
};

// Is a word still mid-utterance at time t?
const slicedAt = (words, t) =>
  words.some(
    (w) =>
      Number(w.s) < t - WORD_SLICE_SEC && Number(w.e) > t + WORD_SLICE_SEC,
  );

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
export function scorePiece({ edl, hook, targetLengthSec, speech } = {}) {
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
  // Only count real words. Sideline's copy is full of spaced em dashes
  // ("Freeze at the peak — this is..."), and counting one as a word would
  // inflate every hook that uses the house style by one.
  const words = String(hook ?? "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length > HOOK_MAX_WORDS) flags.add("hook_too_long");

  // — speech boundaries —
  //
  // Needs word timings, which only exist when a clip had speech. No speech, no
  // transcript, or no timings passed in means these simply do not fire: silent
  // footage cannot be cut off mid-sentence, and a missing transcript must never
  // invent a defect.
  if (speech && usable.length) {
    // 1. A cut that slices a word in half, at either end of any segment. This
    //    is unambiguous — you hear part of a syllable — so it needs no
    //    judgement about whether the sentence was "finished".
    for (const s of usable) {
      const words = wordsFor(speech, s.asset_id);
      if (!words.length) continue;
      if (slicedAt(words, Number(s.in)) || slicedAt(words, Number(s.out))) {
        flags.add("cut_mid_word");
        break;
      }
    }

    // 2. The reel ends while the speaker is still going — the complaint that
    //    started this check. Two conditions must BOTH hold, so a piece that
    //    simply ends on a quiet beat is not flagged: the last audible word
    //    does not close a sentence, AND speech resumes almost immediately
    //    after the cut.
    const last = usable[usable.length - 1];
    const words = wordsFor(speech, last.asset_id);
    const out = Number(last.out);
    const spoken = words.filter((w) => Number(w.e) <= out + WORD_SLICE_SEC);
    if (spoken.length) {
      const closed = ENDS_SENTENCE.test(String(spoken[spoken.length - 1].w ?? "").trim());
      const resumesAt = words.find((w) => Number(w.s) > out - WORD_SLICE_SEC);
      const resumesSoon =
        resumesAt && Number(resumesAt.s) - out < SPEECH_CONTINUES_SEC;
      if (!closed && resumesSoon) flags.add("ends_mid_sentence");
    }
  }

  return [...flags].sort();
}
