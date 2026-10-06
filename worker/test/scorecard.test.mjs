// Regression suite for the scorecard — the ruler every later Phase 3 item is
// measured with. If these checks are wrong, every number built on them is too.
// Run with:  npm test   (from worker/)
import { scorePiece } from "../src/scorecard.js";

let pass = 0, fail = 0;
const t = (name, input, expected) => {
  const got = scorePiece(input);
  const ok = JSON.stringify(got) === JSON.stringify(expected.sort());
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}\n        got [${got}]${ok ? "" : `  want [${expected}]`}`);
  ok ? pass++ : fail++;
};
const seg = (asset, a, b) => ({ asset_id: asset, in: a, out: b });
const cap = (t0, t1, style = "body") => ({ text: "x", t0, t1, style });

// A clean 24s montage: 4 shots, tidy sequential captions, short hook.
const clean = {
  edl: {
    segments: [seg("A", 0, 6), seg("B", 10, 16), seg("C", 30, 36), seg("A", 50, 56)],
    captions: [cap(0, 2.2, "hook"), cap(3, 6), cap(8, 12)],
  },
  hook: "Train here. Leave better.",
  targetLengthSec: 25,
};

console.log("--- clean piece must produce NO flags ---");
t("clean 24s montage", clean, []);

console.log("\n--- each check fires on its own ---");
t("captions_overlap", { ...clean, edl: { ...clean.edl, captions: [cap(0, 4, "hook"), cap(2, 6)] } }, ["captions_overlap"]);
t("piece_too_short (4s)", { ...clean, edl: { ...clean.edl, segments: [seg("A", 0, 4)], captions: [] } }, ["piece_too_short"]);
t("segment_too_short (0.3s)", { ...clean, edl: { ...clean.edl, segments: [seg("A", 0, 20), seg("B", 5, 5.3)] } }, ["segment_too_short", "segment_too_long"]);
t("segment_too_long (20s of a 25s target)", { ...clean, edl: { ...clean.edl, segments: [seg("A", 0, 20), seg("B", 30, 36)] } }, ["segment_too_long"]);
t("footage_repeated (same clip, overlapping)", { ...clean, edl: { ...clean.edl, segments: [seg("A", 0, 8), seg("A", 6, 14)] } }, ["footage_repeated"]);
t("hook_too_long (9 words)", { ...clean, hook: "one two three four five six seven eight nine" }, ["hook_too_long"]);
t("captions_run_past_end", { ...clean, edl: { ...clean.edl, captions: [cap(0, 99)] } }, ["captions_run_past_end"]);

console.log("\n--- must NOT false-positive ---");
t("shots that meet exactly at 6.0s", { ...clean, edl: { ...clean.edl, segments: [seg("A", 0, 6), seg("A", 6, 12), seg("B", 0, 10)] } }, []);
t("captions that touch exactly at 2.2s", { ...clean, edl: { ...clean.edl, captions: [cap(0, 2.2, "hook"), cap(2.2, 5)] } }, []);
t("same clip, non-overlapping ranges", { ...clean, edl: { ...clean.edl, segments: [seg("A", 0, 10), seg("A", 20, 30)] } }, []);
t("single long shot (60s single, no target split)", { edl: { segments: [seg("A", 0, 40)], captions: [] }, hook: "Short hook", targetLengthSec: 40 }, []);
t("hook of exactly 8 words", { ...clean, hook: "one two three four five six seven eight" }, []);
t("spaced em dash is not a word", { ...clean, hook: "one two three — four five six seven eight" }, []);
t("punctuation-only hook", { ...clean, hook: "— — — — — — — — — —" }, []);

console.log("\n--- garbage in ---");
t("no arguments at all", undefined, ["piece_too_short"]);
t("empty edl", { edl: {}, hook: "", targetLengthSec: 25 }, ["piece_too_short"]);
t("null segments / captions", { edl: { segments: null, captions: null }, hook: null }, ["piece_too_short"]);
t("NaN times are ignored", { ...clean, edl: { segments: [seg("A", 0, 10), seg("B", "x", "y")], captions: [cap(0, 2, "hook")] } }, []);


// ——— speech boundaries (added 2026-10-06) ———
//
// The first outside coach rejected a reel for "a sentence that was incomplete
// in the video", and the scorecard missed it entirely. The cases that must NOT
// fire matter most here: a false "you cut them off" would push the editor into
// padding every cut with silence.
//
// "Most players skip this. And it kills their first touch." — one clip, with a
// clear pause between the sentences (2.5 -> 3.2) and a breath inside the second
// one (4.00 -> 4.15), so the two checks can be exercised separately.
const SPEECH = {
  a1: [
    { w: "Most", s: 1.0, e: 1.3 }, { w: "players", s: 1.3, e: 1.8 },
    { w: "skip", s: 1.8, e: 2.1 }, { w: "this.", s: 2.1, e: 2.5 },
    { w: "And", s: 3.2, e: 3.4 }, { w: "it", s: 3.4, e: 3.6 },
    { w: "kills", s: 3.6, e: 4.0 }, { w: "their", s: 4.15, e: 4.45 },
    { w: "first", s: 4.45, e: 4.8 }, { w: "touch.", s: 4.8, e: 5.3 },
  ],
};
// Silent B-roll first, so the piece clears the 5s minimum and the SPEECH
// segment stays last — which is the one `ends_mid_sentence` inspects.
const PAD = seg("broll", 0, 9);
// targetLengthSec 30 keeps the 9s pad under the half-the-piece rule.
const talk = (a, b) => ({
  edl: { segments: [PAD, { asset_id: "a1", in: a, out: b }] },
  hook: "Clean",
  targetLengthSec: 30,
  speech: SPEECH,
});

console.log("\n--- speech boundaries: must NOT fire ---");
t("ends on a full stop with a pause after", talk(0.5, 2.6), []);
t("ends on the final sentence, nothing follows", talk(0.5, 5.5), []);
t("cut lands in the gap between sentences", talk(0.5, 2.9), []);
t("a breath mid-sentence is still mid-sentence, not a clean end", talk(0.5, 4.08), ["ends_mid_sentence"]);
t("silent footage — no words for this asset", { ...talk(0.5, 5.5), speech: { other: [] } }, []);
t("no speech map at all behaves as before", { ...talk(0.5, 3.5), speech: undefined }, []);
t("words with missing timings are ignored", { ...talk(0.5, 3.5), speech: { a1: [{ w: "x" }, { w: "y", s: null, e: "nope" }] } }, []);
t("speech for an asset the segments never use", { ...talk(0.5, 3.5), speech: { zz: SPEECH.a1 } }, []);

console.log("\n--- speech boundaries: must fire ---");
t("cutting after a full stop is CLEAN, not mid-sentence", talk(0.5, 3.0), []);
// A cut can genuinely be both — it slices "their" AND leaves the sentence open.
t("a cut can slice a word AND end mid-sentence", talk(0.5, 4.3), ["cut_mid_word", "ends_mid_sentence"]);
t("cut slices a word at the in point", talk(3.75, 5.4), ["cut_mid_word"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
