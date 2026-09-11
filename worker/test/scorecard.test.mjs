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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
